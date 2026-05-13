import type { SupabaseClient } from "@supabase/supabase-js";
import type { ForeignKey } from "@/lib/schema/types";
import { toAppError } from "./errors";

export interface ReferenceOption {
  value: unknown;
  label: string;
}

export async function searchReferences(
  client: SupabaseClient,
  fk: ForeignKey,
  labelColumn: string | null,
  term: string,
  limit = 20,
): Promise<ReferenceOption[]> {
  const select = labelColumn && labelColumn !== fk.column
    ? `${fk.column}, ${labelColumn}`
    : fk.column;

  let q = client.schema(fk.schema).from(fk.table).select(select).limit(limit);
  if (labelColumn && term.trim().length > 0) {
    q = q.ilike(labelColumn, `%${term.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw toAppError(error);
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
    const value = r[fk.column];
    const labelRaw = labelColumn ? r[labelColumn] : value;
    const label = labelRaw == null ? String(value) : String(labelRaw);
    return { value, label };
  });
}

export async function lookupReferenceLabels(
  client: SupabaseClient,
  fk: ForeignKey,
  labelColumn: string | null,
  values: unknown[],
): Promise<Map<string, string>> {
  const distinct = Array.from(new Set(values.filter((v) => v !== null && v !== undefined)));
  if (distinct.length === 0 || !labelColumn) return new Map();

  const select = labelColumn !== fk.column ? `${fk.column}, ${labelColumn}` : fk.column;
  const { data, error } = await client
    .schema(fk.schema)
    .from(fk.table)
    .select(select)
    .in(fk.column, distinct as never[])
    .limit(distinct.length);
  if (error) throw toAppError(error);
  const map = new Map<string, string>();
  for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const key = String(r[fk.column]);
    const labelRaw = r[labelColumn];
    map.set(key, labelRaw == null ? key : String(labelRaw));
  }
  return map;
}
