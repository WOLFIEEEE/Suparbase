import type { PrimaryKeyValue, Row, Table } from "@/lib/types/schema";
import { AppError } from "@/lib/errors";
import { pgrest } from "./client";

export interface ListParams {
  page: number;
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

export async function listRows(connectionId: string, table: Table, params: ListParams): Promise<ListResult> {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  const query = new URLSearchParams();
  query.set("select", "*");
  if (params.sort) {
    query.set("order", `${params.sort.column}.${params.sort.direction}`);
  } else if (table.primaryKey.length > 0) {
    query.set("order", `${table.primaryKey[0]!}.asc`);
  }
  if (params.search && params.search.trim().length > 0) {
    const term = escapeIlikeTerm(params.search.trim());
    const cols = textSearchColumns(table);
    if (cols.length > 0) {
      query.set("or", `(${cols.map((c) => `${c}.ilike.*${term}*`).join(",")})`);
    }
  }

  const res = await pgrest<Row[]>({
    connectionId,
    path: encodeURIComponent(table.name),
    query,
    headers: {
      Range: `${from}-${to}`,
      "Range-Unit": "items",
      Prefer: "count=exact",
    },
  });
  return {
    rows: res.data ?? [],
    totalCount: res.count,
    estimated: false,
  };
}

function pkToFilters(pk: PrimaryKeyValue): URLSearchParams {
  const q = new URLSearchParams();
  for (const [col, val] of Object.entries(pk)) q.set(col, `eq.${String(val)}`);
  return q;
}

export async function getRow(connectionId: string, table: Table, pk: PrimaryKeyValue): Promise<Row> {
  const entries = Object.entries(pk);
  if (entries.length === 0) throw new AppError("client_bug", "Cannot fetch a row without a primary key.");
  const query = pkToFilters(pk);
  query.set("select", "*");
  query.set("limit", "1");
  const res = await pgrest<Row[]>({
    connectionId,
    path: encodeURIComponent(table.name),
    query,
  });
  if (!res.data || res.data.length === 0) throw new AppError("not_found", "Row not found.");
  return res.data[0]!;
}

function stripGeneratedEmpties(table: Table, values: Row): Row {
  const out: Row = {};
  for (const col of table.columns) {
    const value = values[col.name];
    if (col.isGenerated && (value === null || value === undefined || value === "")) continue;
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
    if (value === null || value === undefined) {
      out[name] = value;
      continue;
    }
    if (col.category === "json" && typeof value === "string") {
      if (value.trim() === "") {
        out[name] = col.nullable ? null : value;
        continue;
      }
      try {
        out[name] = JSON.parse(value);
      } catch {
        out[name] = value;
      }
      continue;
    }
    if ((col.category === "integer" || col.category === "float") && typeof value === "string") {
      if (value.trim() === "") {
        out[name] = col.nullable ? null : value;
        continue;
      }
      const n = Number(value);
      out[name] = Number.isFinite(n) ? n : value;
      continue;
    }
    if (col.category === "boolean" && typeof value === "string") {
      out[name] = value === "true";
      continue;
    }
    out[name] = value;
  }
  return out;
}

export async function insertRow(connectionId: string, table: Table, values: Row): Promise<Row> {
  const cleaned = coerceForWrite(table, stripGeneratedEmpties(table, values));
  const res = await pgrest<Row[]>({
    connectionId,
    method: "POST",
    path: encodeURIComponent(table.name),
    body: cleaned,
    headers: {
      Prefer: "return=representation",
    },
  });
  if (!res.data || res.data.length === 0) throw new AppError("server", "Insert did not return the new row.");
  return res.data[0]!;
}

export async function updateRow(
  connectionId: string,
  table: Table,
  pk: PrimaryKeyValue,
  patch: Row,
): Promise<Row> {
  const coerced = coerceForWrite(table, patch);
  const query = pkToFilters(pk);
  const res = await pgrest<Row[]>({
    connectionId,
    method: "PATCH",
    path: encodeURIComponent(table.name),
    query,
    body: coerced,
    headers: {
      Prefer: "return=representation",
    },
  });
  if (!res.data || res.data.length === 0) throw new AppError("not_found", "No row matched the primary key.");
  return res.data[0]!;
}

export async function deleteRow(connectionId: string, table: Table, pk: PrimaryKeyValue): Promise<void> {
  const query = pkToFilters(pk);
  await pgrest<null>({
    connectionId,
    method: "DELETE",
    path: encodeURIComponent(table.name),
    query,
  });
}
