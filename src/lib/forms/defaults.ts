import type { Column, Row, Table } from "@/lib/schema/types";

/** Initial values for the create form: leave generated columns blank. */
export function defaultsForCreate(table: Table): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of table.columns) {
    if (col.isGenerated) {
      out[col.name] = "";
      continue;
    }
    out[col.name] = nullableInitial(col);
  }
  return out;
}

/** Initial values for the edit form: existing row values, JSON stringified for the editor. */
export function defaultsForEdit(table: Table, row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of table.columns) {
    const v = row[col.name];
    if (v === null || v === undefined) {
      out[col.name] = nullableInitial(col);
      continue;
    }
    if (col.category === "json") {
      out[col.name] = typeof v === "string" ? v : safeStringify(v);
      continue;
    }
    if (col.category === "datetime" && typeof v === "string") {
      // PG returns 2024-01-01T12:00:00+00:00; <input datetime-local> wants 2024-01-01T12:00
      const trimmed = v.replace(/(\.\d+)?([+-]\d{2}:?\d{2}|Z)$/, "");
      out[col.name] = trimmed.slice(0, 16);
      continue;
    }
    out[col.name] = v;
  }
  return out;
}

function nullableInitial(col: Column): unknown {
  switch (col.category) {
    case "boolean":
      return col.nullable ? null : false;
    case "json":
      return col.nullable ? "" : "{}";
    default:
      return col.nullable ? "" : "";
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
