import "server-only";
import { decryptKey } from "@/server/crypto/vault";
import { auditWrite } from "@/server/audit/log";
import type { ConnectionRow } from "@/server/schema/connections";
import type { PrimaryKeyValue, Row } from "@/lib/types/schema";

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

    // (a) snapshot SELECT for undo: direct GET (the pgrestCall helper only
    //     handles DELETE/PATCH per its Verb literal).
    if (returnSnapshots) {
      const sel = new URLSearchParams(filter);
      sel.set("select", "*");
      const key = decryptKey(connection.encryptedKey);
      const selUrl = `${connection.url}/rest/v1/${encodeURIComponent(tableName)}?${sel.toString()}`;
      const selResp = await fetch(selUrl, {
        method: "GET",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "X-Client-Info": "suparbase-saas/0.7",
        },
      });
      if (selResp.ok) {
        const rows = (await selResp.json()) as Row[];
        snapshots.push(...rows);
      }
    }

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
    deleted += chunk.length;

    // (c) audit fan-out: one row per affected PK
    await Promise.all(
      chunk.map((pk) =>
        auditWrite({
          userId,
          connectionId: connection.id,
          schemaName: "public",
          tableName,
          primaryKey: pk,
          verb: "delete",
          httpStatus: 200,
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
}

export interface BulkUpdateResult {
  updated: number;
}

export async function bulkUpdate(args: BulkUpdateArgs): Promise<BulkUpdateResult> {
  const { userId, connection, tableName, primaryKey, primaryKeys, patch } = args;
  let updated = 0;

  for (const chunk of chunkList(primaryKeys, CHUNK_SIZE)) {
    const filter = chunkToQuery(primaryKey, chunk);
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
    updated += chunk.length;

    await Promise.all(
      chunk.map((pk) =>
        auditWrite({
          userId,
          connectionId: connection.id,
          schemaName: "public",
          tableName,
          primaryKey: pk,
          verb: "update",
          httpStatus: 200,
        }),
      ),
    );
  }

  return { updated };
}
