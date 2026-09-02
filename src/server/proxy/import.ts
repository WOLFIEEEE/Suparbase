import "server-only";
import { decryptKey } from "@/server/crypto/vault";
import { assertSafePostgresConnectionString } from "@/server/security/egress";
import { auditWrite } from "@/server/audit/log";
import postgres from "postgres";
import { attachToSession } from "@/server/sentry/sessions";
import type { ConnectionRow } from "@/server/schema/connections";
import type { Row, Table } from "@/lib/types/schema";

const PER_CHUNK_LIMIT = 500;
export const ATOMIC_IMPORT_LIMIT = 5_000;

export interface ImportChunkArgs {
  userId: string;
  connection: ConnectionRow;
  table: Table;
  rows: Record<string, unknown>[];
  onError: "skip" | "abort";
  userAgent?: string | null;
}

export interface ImportRowError {
  index: number;
  column?: string;
  reason: string;
}

export interface ImportChunkResult {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

function coerceForWrite(table: Table, values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const col = table.columns.find((c) => c.name === name);
    if (!col) continue; // unknown columns silently dropped (PostgREST would reject anyway)
    if (col.isGenerated && (value === null || value === undefined || value === "")) continue;
    if (value === null || value === undefined) {
      out[name] = value;
      continue;
    }
    if (col.category === "json" && typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") {
        if (col.nullable) {
          out[name] = null;
        }
        continue;
      }
      try {
        out[name] = JSON.parse(trimmed);
      } catch {
        out[name] = trimmed;
      }
      continue;
    }
    if ((col.category === "integer" || col.category === "float") && typeof value === "string") {
      if (value.trim() === "") {
        if (col.nullable) out[name] = null;
        continue;
      }
      const n = Number(value);
      out[name] = Number.isFinite(n) ? n : value;
      continue;
    }
    if (col.category === "boolean" && typeof value === "string") {
      const lower = value.toLowerCase();
      out[name] = lower === "true" || lower === "t" || lower === "1" || lower === "yes";
      continue;
    }
    out[name] = value;
  }
  return out;
}

type InsertOutcome =
  | { ok: true; row: Row }
  | { ok: false; error: string };

async function insertOneRow(
  connection: ConnectionRow,
  tableName: string,
  body: Record<string, unknown>,
): Promise<InsertOutcome> {
  const key = decryptKey(connection.encryptedKey);
  const url = `${connection.url}/rest/v1/${encodeURIComponent(tableName)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "X-Client-Info": "suparbase-saas/0.7",
      "content-type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    return { ok: false, error: (await resp.text()) || `Upstream ${resp.status}` };
  }
  const parsed = (await resp.json()) as Row[];
  return { ok: true, row: parsed[0] ?? {} };
}

export async function importChunk(args: ImportChunkArgs): Promise<ImportChunkResult> {
  if (args.rows.length < 1 || args.rows.length > PER_CHUNK_LIMIT) {
    throw new Error(`rows must be 1..${PER_CHUNK_LIMIT} entries`);
  }
  const result: ImportChunkResult = { imported: 0, skipped: 0, errors: [] };
  // Audit rows we'll commit only after the whole chunk succeeds (abort mode)
  // or as-we-go (skip mode). We keep the commit list for both flows.
  const pendingAudits: Array<{ pk: Record<string, unknown> | null; row: Row }> = [];

  for (let i = 0; i < args.rows.length; i++) {
    const raw = args.rows[i]!;
    const body = coerceForWrite(args.table, raw);
    const outcome = await insertOneRow(args.connection, args.table.name, body);
    if (!outcome.ok) {
      const errEntry: ImportRowError = { index: i, reason: outcome.error };
      if (args.onError === "abort") {
        result.errors.push(errEntry);
        result.skipped = args.rows.length - i;
        return result;
      }
      result.errors.push(errEntry);
      result.skipped += 1;
      continue;
    }
    result.imported += 1;
    const pk = pickPrimaryKey(args.table, outcome.row);
    pendingAudits.push({ pk, row: outcome.row });
  }

  const agentSession = pendingAudits.length > 0
    ? await attachToSession({
        userId: args.userId,
        connectionId: args.connection.id,
        userAgent: args.userAgent ?? null,
        schemaName: args.table.schema,
        tableName: args.table.name,
      })
    : null;
  // Commit audit rows (best-effort, non-blocking shape: we await but
  // failures don't reject the request).
  await Promise.all(
    pendingAudits.map(({ pk, row }) =>
      auditWrite({
        userId: args.userId,
        connectionId: args.connection.id,
        schemaName: "public",
        tableName: args.table.name,
        primaryKey: pk,
        verb: "insert",
        httpStatus: 201,
        beforeRow: null,
        afterRow: row,
        sessionId: agentSession?.id ?? null,
      }),
    ),
  );

  return result;
}

function pickPrimaryKey(table: Table, row: Row): Record<string, unknown> | null {
  if (table.primaryKey.length === 0) return null;
  const pk: Record<string, unknown> = {};
  for (const col of table.primaryKey) {
    if (row[col] == null) return null;
    pk[col] = row[col];
  }
  return pk;
}

/**
 * Insert the complete import inside one Direct Postgres transaction. Rows are
 * grouped by their concrete column set so omitted/defaulted fields retain
 * their normal PostgreSQL semantics. Any failure rolls back every group.
 */
export async function importRowsAtomic(
  args: Omit<ImportChunkArgs, "onError">,
): Promise<ImportChunkResult> {
  if (args.rows.length < 1 || args.rows.length > ATOMIC_IMPORT_LIMIT) {
    throw new Error(`rows must be 1..${ATOMIC_IMPORT_LIMIT} entries for an atomic import`);
  }
  if (!args.connection.encryptedPostgresUrl) {
    throw new Error("A Direct Postgres URL is required for an all-or-nothing import.");
  }

  const normalized = args.rows.map((row) => coerceForWrite(args.table, row));
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of normalized) {
    const columns = Object.keys(row).sort();
    if (columns.length === 0) throw new Error("An import row has no writable columns.");
    const key = columns.join("\u0000");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const url = await assertSafePostgresConnectionString(
    decryptKey(args.connection.encryptedPostgresUrl),
  );
  const client = postgres(url, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
  });
  const inserted: Row[] = [];
  try {
    await client.begin(async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = 60000");
      for (const [key, rows] of groups) {
        const columns = key.split("\u0000");
        for (let offset = 0; offset < rows.length; offset += PER_CHUNK_LIMIT) {
          const chunk = rows.slice(offset, offset + PER_CHUNK_LIMIT);
          const params: unknown[] = [];
          const tuples = chunk.map((row) => {
            const placeholders = columns.map((column) => {
              params.push(row[column]);
              return `$${params.length}`;
            });
            return `(${placeholders.join(", ")})`;
          });
          const statement = `INSERT INTO ${quoteIdent(args.table.schema)}.${quoteIdent(args.table.name)} (${columns.map(quoteIdent).join(", ")}) VALUES ${tuples.join(", ")} RETURNING *`;
          const result = await tx.unsafe(statement, params as never[]);
          inserted.push(...(result as unknown as Row[]));
        }
      }
    });
  } finally {
    await client.end({ timeout: 5 });
  }

  const agentSession = inserted.length > 0
    ? await attachToSession({
        userId: args.userId,
        connectionId: args.connection.id,
        userAgent: args.userAgent ?? null,
        schemaName: args.table.schema,
        tableName: args.table.name,
      })
    : null;
  await Promise.all(
    inserted.map((row) =>
      auditWrite({
        userId: args.userId,
        connectionId: args.connection.id,
        schemaName: args.table.schema,
        tableName: args.table.name,
        primaryKey: pickPrimaryKey(args.table, row),
        verb: "insert",
        httpStatus: 201,
        beforeRow: null,
        afterRow: row,
        sessionId: agentSession?.id ?? null,
      }),
    ),
  );
  return { imported: inserted.length, skipped: 0, errors: [] };
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
