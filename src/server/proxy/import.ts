import "server-only";
import { decryptKey } from "@/server/crypto/vault";
import { auditWrite } from "@/server/audit/log";
import type { ConnectionRow } from "@/server/schema/connections";
import type { Row, Table } from "@/lib/types/schema";

const PER_CHUNK_LIMIT = 500;

export interface ImportChunkArgs {
  userId: string;
  connection: ConnectionRow;
  table: Table;
  rows: Record<string, unknown>[];
  onError: "skip" | "abort";
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
  const pendingAudits: Array<{ pk: Record<string, unknown> | null }> = [];

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
    pendingAudits.push({ pk });
  }

  // Commit audit rows (best-effort, non-blocking shape: we await but
  // failures don't reject the request).
  await Promise.all(
    pendingAudits.map(({ pk }) =>
      auditWrite({
        userId: args.userId,
        connectionId: args.connection.id,
        schemaName: "public",
        tableName: args.table.name,
        primaryKey: pk,
        verb: "insert",
        httpStatus: 201,
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
