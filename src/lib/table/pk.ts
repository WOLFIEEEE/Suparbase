import type { PrimaryKeyValue, Row, Table } from "@/lib/schema/types";

/** Encode a primary key into a URL-safe segment. */
export function encodePkSegment(pk: PrimaryKeyValue): string {
  const entries = Object.entries(pk);
  if (entries.length === 1) {
    return encodeURIComponent(String(entries[0]![1]));
  }
  return entries.map(([k, v]) => `${k}-${encodeURIComponent(String(v))}`).join("__");
}

export function decodePkSegment(table: Table, segment: string): PrimaryKeyValue | null {
  if (!table.primaryKey.length) return null;
  if (table.primaryKey.length === 1) {
    const col = table.primaryKey[0]!;
    return { [col]: decodeURIComponent(segment) };
  }
  const parts = segment.split("__");
  const out: PrimaryKeyValue = {};
  for (const part of parts) {
    const dash = part.indexOf("-");
    if (dash < 0) continue;
    const key = part.slice(0, dash);
    const value = decodeURIComponent(part.slice(dash + 1));
    out[key] = value;
  }
  return out;
}

export function extractPk(table: Table, row: Row): PrimaryKeyValue {
  const out: PrimaryKeyValue = {};
  for (const col of table.primaryKey) {
    out[col] = row[col];
  }
  return out;
}
