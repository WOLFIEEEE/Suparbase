import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import type { Schema, Table } from "@/lib/types/schema";
import { pgrestServerGet } from "./server-pgrest";

const MAX_TABLES = 25;
const MAX_TEXT_COLS_PER_TABLE = 4;
const PER_TABLE_LIMIT = 5;
const TOTAL_RESULT_CAP = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SearchHit {
  table: string;
  schema: string;
  displayName?: string;
  primaryKey: Record<string, unknown>;
  matchedColumn: string;
  snippet: string;
}

interface SearchArgs {
  conn: ConnectionRow;
  schema: Schema;
  query: string;
}

/**
 * Find rows containing `query` across every (non-system) table in the
 * project, in parallel. Each table contributes up to PER_TABLE_LIMIT hits
 * and the total is capped at TOTAL_RESULT_CAP. Read-only.
 */
export async function searchRows({ conn, schema, query }: SearchArgs): Promise<SearchHit[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const isUuid = UUID_RE.test(term);
  const looksLikeNumber = /^-?\d+(\.\d+)?$/.test(term);

  const tables = schema.tables
    .filter((t) => t.schema !== "auth" && t.schema !== "storage" && t.kind === "table")
    .slice(0, MAX_TABLES);

  const results = await Promise.allSettled(
    tables.map((t) => searchOneTable({ conn, table: t, term, isUuid, looksLikeNumber })),
  );

  const hits: SearchHit[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") hits.push(...r.value);
    if (hits.length >= TOTAL_RESULT_CAP) break;
  }
  return hits.slice(0, TOTAL_RESULT_CAP);
}

interface OneArgs {
  conn: ConnectionRow;
  table: Table;
  term: string;
  isUuid: boolean;
  looksLikeNumber: boolean;
}

async function searchOneTable({ conn, table, term, isUuid, looksLikeNumber }: OneArgs): Promise<SearchHit[]> {
  if (table.primaryKey.length === 0) return [];

  // Pick searchable columns based on the query shape.
  const textCols = table.columns
    .filter((c) => c.category === "string" || c.category === "text")
    .slice(0, MAX_TEXT_COLS_PER_TABLE)
    .map((c) => c.name);
  const uuidCols = table.columns.filter((c) => c.category === "uuid").map((c) => c.name);
  const intCols = table.columns
    .filter((c) => c.category === "integer" || c.category === "float")
    .map((c) => c.name);

  const filters: string[] = [];
  if (isUuid) {
    for (const c of uuidCols) filters.push(`${c}.eq.${term}`);
  }
  if (looksLikeNumber) {
    for (const c of intCols) filters.push(`${c}.eq.${term}`);
  }
  for (const c of textCols) {
    filters.push(`${c}.ilike.*${escapeIlike(term)}*`);
  }
  if (filters.length === 0) return [];

  const q = new URLSearchParams();
  const labelCol =
    table.labelColumn ??
    textCols[0] ??
    table.columns.find((c) => c.category === "string" || c.category === "text")?.name ??
    null;
  const selectCols = unique([
    ...table.primaryKey,
    ...(labelCol ? [labelCol] : []),
    ...textCols.slice(0, 2),
  ]);
  q.set("select", selectCols.join(","));
  q.set("or", `(${filters.join(",")})`);
  q.set("limit", String(PER_TABLE_LIMIT));

  const res = await pgrestServerGet<unknown[]>({
    conn,
    path: encodeURIComponent(table.name),
    query: q,
  });
  if (!Array.isArray(res.data)) return [];

  return res.data.flatMap((rawRow): SearchHit[] => {
    if (typeof rawRow !== "object" || !rawRow) return [];
    const row = rawRow as Record<string, unknown>;
    const pk: Record<string, unknown> = {};
    for (const k of table.primaryKey) pk[k] = row[k];
    const match = pickMatch(row, term, [...textCols, ...uuidCols, ...intCols]);
    return [
      {
        table: table.name,
        schema: table.schema,
        primaryKey: pk,
        matchedColumn: match.column,
        snippet: snippetAround(match.value, term),
      },
    ];
  });
}

function pickMatch(
  row: Record<string, unknown>,
  term: string,
  cols: string[],
): { column: string; value: string } {
  const lc = term.toLowerCase();
  for (const c of cols) {
    const v = row[c];
    if (v == null) continue;
    const s = String(v);
    if (s.toLowerCase().includes(lc)) {
      return { column: c, value: s };
    }
  }
  // Fallback: just return the first non-null field
  for (const c of cols) {
    const v = row[c];
    if (v != null) return { column: c, value: String(v) };
  }
  return { column: cols[0] ?? "", value: "" };
}

function snippetAround(value: string, term: string): string {
  if (!value) return "";
  if (value.length <= 80) return value;
  const lc = value.toLowerCase();
  const i = lc.indexOf(term.toLowerCase());
  if (i < 0) return value.slice(0, 80) + "…";
  const start = Math.max(0, i - 24);
  const end = Math.min(value.length, i + term.length + 36);
  const left = start > 0 ? "…" : "";
  const right = end < value.length ? "…" : "";
  return left + value.slice(start, end) + right;
}

function escapeIlike(s: string): string {
  return s.replace(/([,()])/g, "\\$1");
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
