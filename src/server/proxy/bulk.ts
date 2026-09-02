import "server-only";
import { decryptKey } from "@/server/crypto/vault";
import { auditWrite } from "@/server/audit/log";
import type { ConnectionRow } from "@/server/schema/connections";
import type { PrimaryKeyValue, Row } from "@/lib/types/schema";
import { attachToSession } from "@/server/sentry/sessions";

const CHUNK_SIZE = 500;
const ALLOWED_VERBS = ["DELETE", "PATCH"] as const;
type Verb = (typeof ALLOWED_VERBS)[number];

interface PgrestCallArgs {
  connection: ConnectionRow;
  tableName: string;
  method: Verb;
  query: URLSearchParams;
  body?: unknown;
}

async function pgrestCall({
  connection,
  tableName,
  method,
  query,
  body,
}: PgrestCallArgs): Promise<Response> {
  const key = decryptKey(connection.encryptedKey);
  const url = `${connection.url}/rest/v1/${encodeURIComponent(tableName)}?${query.toString()}`;
  const headers = new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`,
    "X-Client-Info": "suparbase-saas/0.7",
    Prefer: "return=representation",
  });
  let init: RequestInit & { duplex?: "half" } = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init = { ...init, body: JSON.stringify(body) };
  }
  return fetch(url, init);
}

/**
 * Build `?pk=in.(a,b,c)` filter (or composite-PK `?and=(...)`) for a chunk
 * of primary keys. For single-column PKs we use the simple `in.()` shape;
 * composite PKs fall back to OR of AND() groups.
 */
function chunkToQuery(primaryKey: string[], chunk: PrimaryKeyValue[]): URLSearchParams {
  const query = new URLSearchParams();
  if (primaryKey.length === 1) {
    const col = primaryKey[0]!;
    const values = chunk.map((pk) => csvSafe(String(pk[col] ?? "")));
    query.set(col, `in.(${values.join(",")})`);
    return query;
  }
  // Composite PK: `or=(and(c1.eq.v1,c2.eq.v2),and(...),...)`
  const groups = chunk.map((pk) => {
    const parts = primaryKey.map((col) => `${col}.eq.${csvSafe(String(pk[col] ?? ""))}`);
    return `and(${parts.join(",")})`;
  });
  query.set("or", `(${groups.join(",")})`);
  return query;
}

function csvSafe(value: string): string {
  if (/[,()."]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function chunkList<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// bulkDelete
// ---------------------------------------------------------------------------

export interface BulkDeleteArgs {
  userId: string;
  connection: ConnectionRow;
  tableName: string;
  primaryKey: string[];
  primaryKeys: PrimaryKeyValue[];
  returnSnapshots?: boolean;
  userAgent?: string | null;
}

export interface BulkDeleteResult {
  deleted: number;
  snapshots: Row[];
}

export async function bulkDelete(args: BulkDeleteArgs): Promise<BulkDeleteResult> {
  const { userId, connection, tableName, primaryKey, primaryKeys } = args;
  const returnSnapshots = args.returnSnapshots ?? true;
  let deleted = 0;
  const snapshots: Row[] = [];

  for (const chunk of chunkList(primaryKeys, CHUNK_SIZE)) {
    const filter = chunkToQuery(primaryKey, chunk);

    // (a) snapshot SELECT for undo. If this fails we stop before deleting;
    // a destructive bulk operation without a before-state is not acceptable.
    const chunkSnapshots = await selectRows(connection, tableName, filter);

    // (b) DELETE itself
    const delResp = await pgrestCall({
      connection,
      tableName,
      method: "DELETE",
      query: filter,
    });

    if (!delResp.ok) {
      // Surface upstream error message verbatim; the caller maps to AppError.
      const text = await delResp.text();
      throw Object.assign(new Error(text || `Upstream ${delResp.status}`), {
        status: delResp.status,
        partial: { deleted, snapshots },
      });
    }
    const deletedRows = await responseRows(delResp);
    deleted += deletedRows.length;
    if (returnSnapshots) snapshots.push(...deletedRows);
    const agentSession = deletedRows.length > 0
      ? await attachToSession({
          userId,
          connectionId: connection.id,
          userAgent: args.userAgent ?? null,
          schemaName: "public",
          tableName,
        })
      : null;

    // (c) audit fan-out: one row per row actually deleted.
    await Promise.all(
      deletedRows.map((row) =>
        auditWrite({
          userId,
          connectionId: connection.id,
          schemaName: "public",
          tableName,
          primaryKey: pickPrimaryKey(primaryKey, row),
          verb: "delete",
          httpStatus: 200,
          beforeRow:
            chunkSnapshots.find(
              (candidate) => stableKey(pickPrimaryKey(primaryKey, candidate)) === stableKey(pickPrimaryKey(primaryKey, row)),
            ) ?? row,
          afterRow: null,
          sessionId: agentSession?.id ?? null,
        }),
      ),
    );
  }

  return { deleted, snapshots };
}

// ---------------------------------------------------------------------------
// bulkUpdate
// ---------------------------------------------------------------------------

export interface BulkUpdateArgs {
  userId: string;
  connection: ConnectionRow;
  tableName: string;
  primaryKey: string[];
  primaryKeys: PrimaryKeyValue[];
  patch: Record<string, unknown>;
  userAgent?: string | null;
}

export interface BulkUpdateResult {
  updated: number;
}

export async function bulkUpdate(args: BulkUpdateArgs): Promise<BulkUpdateResult> {
  const { userId, connection, tableName, primaryKey, primaryKeys, patch } = args;
  let updated = 0;

  for (const chunk of chunkList(primaryKeys, CHUNK_SIZE)) {
    const filter = chunkToQuery(primaryKey, chunk);
    const beforeRows = await selectRows(connection, tableName, filter);
    const resp = await pgrestCall({
      connection,
      tableName,
      method: "PATCH",
      query: filter,
      body: patch,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw Object.assign(new Error(text || `Upstream ${resp.status}`), {
        status: resp.status,
        partial: { updated },
      });
    }
    const afterRows = await responseRows(resp);
    updated += afterRows.length;
    const beforeByKey = new Map(
      beforeRows.map((row) => [stableKey(pickPrimaryKey(primaryKey, row)), row]),
    );
    const agentSession = afterRows.length > 0
      ? await attachToSession({
          userId,
          connectionId: connection.id,
          userAgent: args.userAgent ?? null,
          schemaName: "public",
          tableName,
        })
      : null;

    await Promise.all(
      afterRows.map((row) => {
        const pk = pickPrimaryKey(primaryKey, row);
        return auditWrite({
          userId,
          connectionId: connection.id,
          schemaName: "public",
          tableName,
          primaryKey: pk,
          verb: "update",
          httpStatus: 200,
          beforeRow: beforeByKey.get(stableKey(pk)) ?? null,
          afterRow: row,
          sessionId: agentSession?.id ?? null,
        });
      }),
    );
  }

  return { updated };
}

async function selectRows(
  connection: ConnectionRow,
  tableName: string,
  filter: URLSearchParams,
): Promise<Row[]> {
  const query = new URLSearchParams(filter);
  query.set("select", "*");
  const key = decryptKey(connection.encryptedKey);
  const response = await fetch(
    `${connection.url}/rest/v1/${encodeURIComponent(tableName)}?${query.toString()}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "X-Client-Info": "suparbase-saas/0.7",
      },
    },
  );
  if (!response.ok) {
    throw Object.assign(new Error("Could not capture rows before the bulk operation."), {
      status: response.status,
    });
  }
  return (await response.json()) as Row[];
}

async function responseRows(response: Response): Promise<Row[]> {
  try {
    const value = await response.json() as unknown;
    return Array.isArray(value)
      ? value.filter((row): row is Row => !!row && typeof row === "object" && !Array.isArray(row))
      : [];
  } catch {
    return [];
  }
}

function pickPrimaryKey(columns: string[], row: Row): PrimaryKeyValue {
  return Object.fromEntries(columns.map((column) => [column, row[column]]));
}

function stableKey(value: PrimaryKeyValue): string {
  return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}
