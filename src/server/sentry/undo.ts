import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import type { ConnectionRow } from "@/server/schema/connections";
import { auditLog } from "@/server/schema/audit";
import { getSession, markUndoResult } from "./sessions";
import { executeSql } from "@/server/proxy/sql-playground";
import { AppError } from "@/lib/errors";

/**
 * Undo engine — reverses every write in an agent_session by replaying
 * the audit log in reverse.
 *
 * Strategy: load every audit_log row attached to the session, sort
 * newest-first, build a reverse SQL statement per row, and run all of
 * them inside a single transaction via executeSql (which the SQL
 * playground already uses).
 *
 * Requires the direct Postgres URL — we deliberately bypass PostgREST
 * + RLS here because this is an admin operation the user has
 * explicitly authorised. PostgREST + RLS would refuse to write rows
 * the anon / authenticated role can't see anyway.
 *
 * Schema mutations (DDL) live outside the audit log, so this only
 * undoes data writes. A v3.1.x follow-up will catch schema drift via
 * pg_event_trigger and offer reverse-migration suggestions.
 */

export interface UndoResult {
  attempted: number;
  reverted: number;
  skipped: number;
  error: string | null;
}

interface AuditRowMinimal {
  id: string;
  schemaName: string;
  tableName: string;
  verb: "insert" | "update" | "delete";
  primaryKey: Record<string, unknown> | null;
  beforeRow: Record<string, unknown> | null;
  afterRow: Record<string, unknown> | null;
}

export async function undoSession(
  userId: string,
  conn: ConnectionRow,
  sessionId: string,
): Promise<UndoResult> {
  if (!conn.encryptedPostgresUrl) {
    throw new AppError(
      "no_postgres_url",
      "Session undo needs the Direct Postgres URL — set it on connection settings.",
    );
  }
  const session = await getSession(userId, conn.id, sessionId);
  if (!session) throw new AppError("not_found", "Session not found.");
  if (session.status === "undone") {
    throw new AppError("validation", "This session has already been undone.");
  }

  const rows = await db
    .select({
      id: auditLog.id,
      schemaName: auditLog.schemaName,
      tableName: auditLog.tableName,
      verb: auditLog.verb,
      primaryKey: auditLog.primaryKey,
      beforeRow: auditLog.beforeRow,
      afterRow: auditLog.afterRow,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, userId),
        eq(auditLog.connectionId, conn.id),
        eq(auditLog.sessionId, sessionId),
      ),
    )
    .orderBy(asc(auditLog.createdAt));

  // Reverse order — most recent change undone first.
  const ordered = rows.slice().reverse();

  let skipped = 0;
  const statements: string[] = [];
  for (const row of ordered) {
    const stmt = buildReverseSql(row as AuditRowMinimal);
    if (stmt === null) {
      skipped += 1;
      continue;
    }
    statements.push(stmt);
  }

  if (statements.length === 0) {
    const result: UndoResult = {
      attempted: ordered.length,
      reverted: 0,
      skipped,
      error: ordered.length === 0 ? null : "No reversible writes in this session.",
    };
    await markUndoResult(sessionId, {
      attempted: result.attempted,
      reverted: 0,
      error: result.error,
    });
    return result;
  }

  // Wrap every statement in a single explicit transaction. executeSql
  // already starts a transaction, but it expects one logical statement
  // — so we concatenate with semicolons. Postgres handles a multi-
  // statement string when wrapped this way.
  const sql = statements.join(";\n") + ";";

  let executionError: string | null = null;
  try {
    await executeSql({
      conn,
      sql,
      readOnly: false,
      statementTimeoutMs: 30_000,
    });
  } catch (e) {
    executionError = (e as Error).message ?? "Undo transaction failed.";
  }

  const reverted = executionError ? 0 : statements.length;
  await markUndoResult(sessionId, {
    attempted: ordered.length,
    reverted,
    error: executionError,
  });

  return {
    attempted: ordered.length,
    reverted,
    skipped,
    error: executionError,
  };
}

// ---------------------------------------------------------------------------
// SQL builder
// ---------------------------------------------------------------------------

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qualified(schemaName: string, tableName: string): string {
  return `${ident(schemaName)}.${ident(tableName)}`;
}

function jsonbLit(value: unknown): string {
  // Pass jsonb through the SQL driver with proper escaping. We embed
  // the JSON as a string literal and cast to jsonb — postgres handles
  // the conversion. Single-quote escaping is enough because we never
  // interpolate user-controlled JS code.
  const json = JSON.stringify(value ?? null).replace(/'/g, "''");
  return `'${json}'::jsonb`;
}

function whereFromPk(pk: Record<string, unknown>): string {
  const clauses: string[] = [];
  for (const [col, val] of Object.entries(pk)) {
    if (val == null) {
      clauses.push(`${ident(col)} IS NULL`);
    } else if (typeof val === "number") {
      clauses.push(`${ident(col)} = ${val}`);
    } else if (typeof val === "boolean") {
      clauses.push(`${ident(col)} = ${val ? "TRUE" : "FALSE"}`);
    } else {
      const text = String(val).replace(/'/g, "''");
      clauses.push(`${ident(col)} = '${text}'`);
    }
  }
  return clauses.join(" AND ");
}

/**
 * Build the SQL that reverses one audit row. Returns null if the row
 * is missing the snapshot we'd need (e.g. an old UPDATE without a
 * beforeRow). Skipped rows are surfaced in the result counts.
 */
export function buildReverseSql(row: AuditRowMinimal): string | null {
  const qname = qualified(row.schemaName, row.tableName);

  if (row.verb === "insert") {
    // Undo an insert by DELETing the primary key.
    if (!row.primaryKey || Object.keys(row.primaryKey).length === 0) {
      // No PK captured (e.g. table without a primary key). Skip.
      return null;
    }
    return `DELETE FROM ${qname} WHERE ${whereFromPk(row.primaryKey)}`;
  }

  if (row.verb === "delete") {
    // Re-insert from the captured beforeRow.
    if (!row.beforeRow) return null;
    const cols = Object.keys(row.beforeRow);
    if (cols.length === 0) return null;
    const colList = cols.map(ident).join(", ");
    const valList = cols
      .map((c) => {
        const v = row.beforeRow![c];
        return jsonValueToSqlLiteral(v);
      })
      .join(", ");
    return `INSERT INTO ${qname} (${colList}) VALUES (${valList})`;
  }

  if (row.verb === "update") {
    if (!row.beforeRow || !row.primaryKey) return null;
    const sets = Object.entries(row.beforeRow)
      .filter(([col]) => !Object.prototype.hasOwnProperty.call(row.primaryKey!, col))
      .map(([col, val]) => `${ident(col)} = ${jsonValueToSqlLiteral(val)}`);
    if (sets.length === 0) return null;
    return `UPDATE ${qname} SET ${sets.join(", ")} WHERE ${whereFromPk(row.primaryKey)}`;
  }

  return null;
}

function jsonValueToSqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "NULL";
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "string") {
    return `'${v.replace(/'/g, "''")}'`;
  }
  // Objects / arrays → JSON, cast to jsonb. Postgres can implicitly
  // cast jsonb to most column types (text via ::text, jsonb to json,
  // etc.). For columns that need a different cast, the user will see
  // a clear error from the transaction.
  return jsonbLit(v);
}
