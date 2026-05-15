import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import { executeSql, SqlExecutionError } from "@/server/proxy/sql-playground";
import { introspectConnection } from "@/server/schema-introspect";
import { AppError } from "@/lib/errors";

/**
 * Auth.sessions inspection + per-user related-record discovery.
 * Talks directly to Postgres via executeSql() since auth.sessions
 * isn't exposed through PostgREST.
 */

export interface SessionRow {
  id: string;
  userId: string;
  createdAt: string | null;
  updatedAt: string | null;
  refreshedAt: string | null;
  notAfter: string | null;
  ip: string | null;
  userAgent: string | null;
  factorId: string | null;
}

const SESSIONS_SQL = `
  SELECT
    s.id::text AS id,
    s.user_id::text AS user_id,
    s.created_at AS created_at,
    s.updated_at AS updated_at,
    s.refreshed_at AS refreshed_at,
    s.not_after AS not_after,
    s.ip::text AS ip,
    s.user_agent AS user_agent,
    s.factor_id::text AS factor_id
  FROM auth.sessions s
  WHERE s.user_id = $1::uuid
  ORDER BY COALESCE(s.refreshed_at, s.updated_at, s.created_at) DESC
  LIMIT 100
`;

export async function listSessions(
  conn: ConnectionRow,
  userId: string,
): Promise<SessionRow[]> {
  try {
    const res = await executeSql({
      conn,
      sql: SESSIONS_SQL,
      readOnly: true,
      statementTimeoutMs: 4_000,
      params: [userId],
    });
    return res.rows.map((row) => ({
      id: String(row[0] ?? ""),
      userId: String(row[1] ?? ""),
      createdAt: stringifyTs(row[2]),
      updatedAt: stringifyTs(row[3]),
      refreshedAt: stringifyTs(row[4]),
      notAfter: stringifyTs(row[5]),
      ip: row[6] ? String(row[6]) : null,
      userAgent: row[7] ? String(row[7]) : null,
      factorId: row[8] ? String(row[8]) : null,
    }));
  } catch (e) {
    throw wrapSqlError(e, "Could not load sessions.");
  }
}

export async function revokeSession(conn: ConnectionRow, sessionId: string): Promise<void> {
  try {
    await executeSql({
      conn,
      sql: `DELETE FROM auth.sessions WHERE id = $1::uuid`,
      readOnly: false,
      statementTimeoutMs: 4_000,
      params: [sessionId],
    });
  } catch (e) {
    throw wrapSqlError(e, "Could not revoke session.");
  }
}

export async function revokeAllSessions(
  conn: ConnectionRow,
  userId: string,
): Promise<number> {
  try {
    const res = await executeSql({
      conn,
      sql: `DELETE FROM auth.sessions WHERE user_id = $1::uuid`,
      readOnly: false,
      statementTimeoutMs: 6_000,
      params: [userId],
    });
    return res.rowCount;
  } catch (e) {
    throw wrapSqlError(e, "Could not revoke sessions.");
  }
}

// ---------------------------------------------------------------------------
// Related records: any table with a column referencing this user
// ---------------------------------------------------------------------------

const USER_COLUMN_NAMES = ["user_id", "owner_id", "created_by", "author_id", "uploaded_by"];

export interface RelatedTable {
  schema: string;
  table: string;
  column: string;
  count: number;
}

/**
 * Find every table in non-system schemas that has a uuid column whose
 * name is in USER_COLUMN_NAMES, then UNION-ALL count rows per table
 * filtered by `column = userId`. Returns at most 100 tables.
 */
export async function findRelatedTables(
  conn: ConnectionRow,
  userId: string,
): Promise<RelatedTable[]> {
  const schema = await introspectConnection(conn);
  const candidates: Array<{ schema: string; table: string; column: string }> = [];

  for (const t of schema.tables) {
    if (t.schema === "auth" || t.schema === "storage" || t.schema === "pg_catalog") continue;
    if (t.kind !== "table") continue;
    for (const col of t.columns) {
      if (USER_COLUMN_NAMES.includes(col.name) && /uuid/i.test(col.pgType)) {
        candidates.push({ schema: t.schema, table: t.name, column: col.name });
        break;
      }
    }
    if (candidates.length >= 100) break;
  }

  if (candidates.length === 0) return [];

  // One UNION ALL query so we don't make N round-trips. Use parametrised
  // $1 for the userId, schema/table are vetted from introspection so
  // identifier injection isn't possible.
  const unions = candidates
    .map(
      (c) =>
        `SELECT '${c.schema}' AS schema_name, '${c.table}' AS table_name, '${c.column}' AS column_name, count(*) AS n FROM "${c.schema}"."${c.table}" WHERE "${c.column}" = $1::uuid`,
    )
    .join("\n UNION ALL \n");

  try {
    const res = await executeSql({
      conn,
      sql: unions,
      readOnly: true,
      statementTimeoutMs: 6_000,
      params: [userId],
    });
    return res.rows
      .map<RelatedTable>((row) => ({
        schema: String(row[0]),
        table: String(row[1]),
        column: String(row[2]),
        count: Number(row[3]) || 0,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  } catch (e) {
    throw wrapSqlError(e, "Could not load related records.");
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function stringifyTs(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function wrapSqlError(e: unknown, fallback: string): AppError {
  if (e instanceof SqlExecutionError) {
    const category = e.category === "rls" ? "unauthorized" : e.category === "validation" ? "validation" : "server";
    return new AppError(category, e.message);
  }
  return new AppError("server", (e as Error).message ?? fallback);
}
