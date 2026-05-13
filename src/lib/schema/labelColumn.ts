import type { Column } from "./types";

const PRIORITY = [
  "name",
  "title",
  "display_name",
  "displayname",
  "label",
  "email",
  "username",
  "handle",
  "slug",
];

export function pickLabelColumn(columns: Column[]): string | null {
  const byName = new Map<string, Column>();
  for (const c of columns) byName.set(c.name.toLowerCase(), c);

  for (const candidate of PRIORITY) {
    const col = byName.get(candidate);
    if (col && (col.category === "string" || col.category === "text")) {
      return col.name;
    }
  }

  // Fallback: single-column text-y primary key
  const pks = columns.filter((c) => c.isPrimaryKey);
  if (pks.length === 1) {
    const pk = pks[0]!;
    if (pk.category === "string" || pk.category === "text" || pk.category === "uuid") {
      return pk.name;
    }
  }

  return null;
}
