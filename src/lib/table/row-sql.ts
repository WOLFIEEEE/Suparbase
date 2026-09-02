import type { Row, Table } from "@/lib/types/schema";

/**
 * Client-side helpers that turn a row into copy-pasteable text. Used by
 * the row "More" menu (Copy as JSON / Copy as SQL INSERT). Pure so it can
 * be unit-tested without a DOM.
 */

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlValue(value: unknown, pgType: string): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return quoteLiteral(value);
  if (Array.isArray(value)) {
    // Postgres array literal for scalar arrays; jsonb arrays go the JSON route.
    if (/^(json|jsonb)$/i.test(pgType)) return `${quoteLiteral(JSON.stringify(value))}::jsonb`;
    const items = value.map((v) => {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      return quoteLiteral(typeof v === "string" ? v : JSON.stringify(v));
    });
    return `ARRAY[${items.join(", ")}]`;
  }
  const json = JSON.stringify(value);
  return `${quoteLiteral(json)}::jsonb`;
}

/** Build a single INSERT statement for the row, one column per line. */
export function rowToInsertSql(table: Table, row: Row): string {
  const cols = table.columns.filter((c) => c.name in row);
  if (cols.length === 0) return `-- ${table.name}: empty row`;
  const names = cols.map((c) => quoteIdentifier(c.name)).join(", ");
  const values = cols.map((c) => sqlValue(row[c.name], c.pgType)).join(",\n  ");
  return `INSERT INTO ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} (${names})\nVALUES (\n  ${values}\n);`;
}

/** Pretty JSON with the table's column order preserved. */
export function rowToJson(table: Table, row: Row): string {
  const ordered: Row = {};
  for (const c of table.columns) if (c.name in row) ordered[c.name] = row[c.name];
  for (const [k, v] of Object.entries(row)) if (!(k in ordered)) ordered[k] = v;
  return JSON.stringify(ordered, null, 2);
}
