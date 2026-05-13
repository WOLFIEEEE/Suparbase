import type { ForeignKey } from "@/lib/types/schema";
import { pgrest } from "./client";

export interface ReferenceOption {
  value: unknown;
  label: string;
}

export async function searchReferences(
  connectionId: string,
  fk: ForeignKey,
  labelColumn: string | null,
  term: string,
  limit = 20,
): Promise<ReferenceOption[]> {
  const select = labelColumn && labelColumn !== fk.column ? `${fk.column},${labelColumn}` : fk.column;
  const query = new URLSearchParams();
  query.set("select", select);
  if (labelColumn && term.trim().length > 0) {
    query.set(labelColumn, `ilike.*${term.trim()}*`);
  }
  query.set("limit", String(limit));
  const res = await pgrest<Array<Record<string, unknown>>>({
    connectionId,
    path: encodeURIComponent(fk.table),
    query,
  });
  return (res.data ?? []).map((r) => {
    const value = r[fk.column];
    const labelRaw = labelColumn ? r[labelColumn] : value;
    return { value, label: labelRaw == null ? String(value) : String(labelRaw) };
  });
}

export async function lookupReferenceLabels(
  connectionId: string,
  fk: ForeignKey,
  labelColumn: string | null,
  values: unknown[],
): Promise<Map<string, string>> {
  const distinct = Array.from(new Set(values.filter((v) => v !== null && v !== undefined)));
  if (distinct.length === 0 || !labelColumn) return new Map();
  const select = labelColumn !== fk.column ? `${fk.column},${labelColumn}` : fk.column;
  const query = new URLSearchParams();
  query.set("select", select);
  query.set(fk.column, `in.(${distinct.map((v) => String(v)).join(",")})`);
  query.set("limit", String(distinct.length));
  const res = await pgrest<Array<Record<string, unknown>>>({
    connectionId,
    path: encodeURIComponent(fk.table),
    query,
  });
  const map = new Map<string, string>();
  for (const r of res.data ?? []) {
    const key = String(r[fk.column]);
    const labelRaw = r[labelColumn];
    map.set(key, labelRaw == null ? key : String(labelRaw));
  }
  return map;
}
