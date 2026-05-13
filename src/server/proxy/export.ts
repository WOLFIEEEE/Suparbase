import "server-only";
import { decryptKey } from "@/server/crypto/vault";
import { csvHeaderLine, csvLineFromValues } from "@/lib/csv/serialize";
import type { ConnectionRow } from "@/server/schema/connections";
import type { Row } from "@/lib/types/schema";

const PAGE_SIZE = 1000;
const MAX_LIMIT = 100_000;

export interface ExportArgs {
  connection: ConnectionRow;
  tableName: string;
  /** Columns to include in the output (in order). Empty = all returned columns. */
  columns: string[];
  /** Optional row limit (clamped to MAX_LIMIT). */
  limit?: number;
  /** Search ?q= passed through as `or(col.ilike.*term*,...)`. */
  searchTextColumns?: string[];
  searchTerm?: string;
  /** Sort like `order=col.dir`. */
  sort?: { column: string; direction: "asc" | "desc" };
  /** Each filter is a raw PostgREST query-value, e.g. ["role.eq.admin", "email.ilike.*acme*"]. */
  filters?: Array<{ column: string; value: string }>;
  /** When set, restrict export to these PKs (bulk Export Selected mode). Bypasses other filters. */
  pkColumn?: string;
  pkValues?: string[];
}

function buildBaseQuery(args: ExportArgs): URLSearchParams {
  const q = new URLSearchParams();
  q.set("select", args.columns.length > 0 ? args.columns.join(",") : "*");

  if (args.pkColumn && args.pkValues && args.pkValues.length > 0) {
    // Export-Selected mode — ignore other filters (per FR-X02 exception).
    const escaped = args.pkValues
      .map((v) => (/[,()."]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
      .join(",");
    q.set(args.pkColumn, `in.(${escaped})`);
    return q;
  }

  if (args.sort) q.set("order", `${args.sort.column}.${args.sort.direction}`);
  if (args.searchTerm && args.searchTextColumns && args.searchTextColumns.length > 0) {
    const term = args.searchTerm.replace(/([,()])/g, "\\$1");
    q.set("or", `(${args.searchTextColumns.map((c) => `${c}.ilike.*${term}*`).join(",")})`);
  }
  for (const f of args.filters ?? []) {
    q.append(f.column, f.value);
  }
  return q;
}

async function fetchPage(
  connection: ConnectionRow,
  tableName: string,
  query: URLSearchParams,
  rangeFrom: number,
  rangeTo: number,
): Promise<Row[]> {
  const key = decryptKey(connection.encryptedKey);
  const url = `${connection.url}/rest/v1/${encodeURIComponent(tableName)}?${query.toString()}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "X-Client-Info": "suparbase-saas/0.7",
      Range: `${rangeFrom}-${rangeTo}`,
      "Range-Unit": "items",
    },
  });
  if (!resp.ok) {
    throw new Error(`Upstream ${resp.status}: ${await resp.text()}`);
  }
  return (await resp.json()) as Row[];
}

/**
 * Stream pages from PostgREST and yield each row. Stops when the page is
 * shorter than PAGE_SIZE (no more rows) or when `limit` is reached.
 */
async function* streamRows(args: ExportArgs): AsyncIterable<Row> {
  const base = buildBaseQuery(args);
  const cap = Math.min(args.limit ?? MAX_LIMIT, MAX_LIMIT);
  let yielded = 0;
  let from = 0;
  while (yielded < cap) {
    const to = Math.min(from + PAGE_SIZE - 1, cap - 1);
    const rows = await fetchPage(args.connection, args.tableName, base, from, to);
    if (rows.length === 0) return;
    for (const r of rows) {
      yield r;
      yielded += 1;
      if (yielded >= cap) return;
    }
    if (rows.length < PAGE_SIZE) return;
    from = to + 1;
  }
}

const encoder = new TextEncoder();

export function streamExportCsv(args: ExportArgs): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const iter = streamRows(args);
        let headerWritten = false;
        let cols = args.columns;
        for await (const row of iter) {
          if (!headerWritten) {
            if (cols.length === 0) cols = Object.keys(row);
            controller.enqueue(encoder.encode(csvHeaderLine(cols)));
            headerWritten = true;
          }
          const values = cols.map((c) => row[c]);
          controller.enqueue(encoder.encode(csvLineFromValues(values)));
        }
        if (!headerWritten && cols.length > 0) {
          // No rows, but we still write a header so the file isn't empty.
          controller.enqueue(encoder.encode(csvHeaderLine(cols)));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

export function streamExportJson(args: ExportArgs): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("["));
        let first = true;
        let cols = args.columns;
        for await (const row of streamRows(args)) {
          if (cols.length === 0) cols = Object.keys(row);
          const projected: Row = {};
          for (const c of cols) projected[c] = row[c];
          controller.enqueue(encoder.encode((first ? "" : ",") + JSON.stringify(projected)));
          first = false;
        }
        controller.enqueue(encoder.encode("]"));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

export function exportFilenameFor(table: string, format: "csv" | "json"): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  // Sanitize table name for filename (strip risky chars).
  const safe = table.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return `${safe}-${yyyy}-${mm}-${dd}.${format}`;
}
