import type { SupabaseClient } from "@supabase/supabase-js";
import type { Column, PrimaryKeyValue, Row, Table } from "@/lib/schema/types";
import { AppError, toAppError } from "./errors";

export interface ListParams {
  page: number; // 1-indexed
  pageSize: 10 | 25 | 50 | 100;
  sort?: { column: string; direction: "asc" | "desc" };
  search?: string;
}

export interface ListResult {
  rows: Row[];
  totalCount: number | null;
  estimated: boolean;
}

const TEXT_SEARCH_COLUMN_CAP = 8;

function textSearchColumns(table: Table): string[] {
  return table.columns
    .filter((c) => c.category === "string" || c.category === "text")
    .map((c) => c.name)
    .slice(0, TEXT_SEARCH_COLUMN_CAP);
}

function escapeIlikeTerm(term: string): string {
  return term.replace(/([,()])/g, "\\$1");
}

export async function listRows(
  client: SupabaseClient,
  table: Table,
  params: ListParams,
): Promise<ListResult> {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = client
    .schema(table.schema)
    .from(table.name)
    .select("*", { count: "exact" })
    .range(from, to);

  if (params.sort) {
    query = query.order(params.sort.column, { ascending: params.sort.direction === "asc" });
  } else if (table.primaryKey.length > 0) {
    query = query.order(table.primaryKey[0]!, { ascending: true });
  }

  if (params.search && params.search.trim().length > 0) {
    const term = escapeIlikeTerm(params.search.trim());
    const columns = textSearchColumns(table);
    if (columns.length > 0) {
      const expr = columns.map((c) => `${c}.ilike.*${term}*`).join(",");
      query = query.or(expr);
    }
  }

  const { data, error, count } = await query;
  if (error) throw toAppError(error);

  return {
    rows: (data ?? []) as Row[],
    totalCount: count ?? null,
    estimated: false,
  };
}

export async function getRow(
  client: SupabaseClient,
  table: Table,
  pk: PrimaryKeyValue,
): Promise<Row> {
  const entries = Object.entries(pk);
  if (entries.length === 0) {
    throw new AppError("client_bug", "Cannot fetch a row without a primary key.");
  }
  let q = client.schema(table.schema).from(table.name).select("*");
  for (const [col, val] of entries) {
    q = q.eq(col, val as never);
  }
  const { data, error } = await q.limit(1);
  if (error) throw toAppError(error);
  if (!data || data.length === 0) throw new AppError("not_found", "Row not found.");
  return data[0] as Row;
}

function stripGeneratedEmpties(table: Table, values: Row): Row {
  const out: Row = {};
  for (const col of table.columns) {
    const value = values[col.name];
    if (col.isGenerated && (value === null || value === undefined || value === "")) {
      continue;
    }
    if (value === undefined) continue;
    out[col.name] = value;
  }
  return out;
}

function coerceForWrite(table: Table, values: Row): Row {
  const out: Row = {};
  for (const [name, value] of Object.entries(values)) {
    const col = table.columns.find((c) => c.name === name);
    if (!col) {
      out[name] = value;
      continue;
    }
    out[name] = coerceValue(col, value);
  }
  return out;
}

function coerceValue(col: Column, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (col.category === "json" && typeof value === "string") {
    if (value.trim() === "") return col.nullable ? null : value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if ((col.category === "integer" || col.category === "float") && typeof value === "string") {
    if (value.trim() === "") return col.nullable ? null : value;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (col.category === "boolean" && typeof value === "string") {
    return value === "true";
  }
  return value;
}

export async function insertRow(
  client: SupabaseClient,
  table: Table,
  values: Row,
): Promise<Row> {
  const cleaned = stripGeneratedEmpties(table, values);
  const coerced = coerceForWrite(table, cleaned);
  const { data, error } = await client
    .schema(table.schema)
    .from(table.name)
    .insert(coerced)
    .select("*")
    .single();
  if (error) throw toAppError(error);
  return data as Row;
}

export async function updateRow(
  client: SupabaseClient,
  table: Table,
  pk: PrimaryKeyValue,
  patch: Row,
): Promise<Row> {
  const coerced = coerceForWrite(table, patch);
  let q = client.schema(table.schema).from(table.name).update(coerced);
  for (const [col, val] of Object.entries(pk)) {
    q = q.eq(col, val as never);
  }
  const { data, error } = await q.select("*").single();
  if (error) throw toAppError(error);
  return data as Row;
}

export async function deleteRow(
  client: SupabaseClient,
  table: Table,
  pk: PrimaryKeyValue,
): Promise<void> {
  let q = client.schema(table.schema).from(table.name).delete();
  for (const [col, val] of Object.entries(pk)) {
    q = q.eq(col, val as never);
  }
  const { error } = await q;
  if (error) throw toAppError(error);
}
