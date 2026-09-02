import type { Table } from "@/lib/types/schema";
import type { ParsedSchema, ParsedTable } from "./ddl";

/**
 * Adapt an introspected connection schema to the `ParsedSchema` shape the
 * free tools consume, so the ERD renderer and the type generator work on a
 * live project exactly as they do on pasted DDL.
 */
export function schemaToParsed(tables: Table[]): ParsedSchema {
  const names = new Set(tables.map((t) => t.name));
  const parsedTables: ParsedTable[] = tables.map((t) => ({
    schema: t.schema,
    name: t.name,
    columns: t.columns.map((c) => ({
      name: c.name,
      type: c.pgType,
      isPrimaryKey: c.isPrimaryKey || t.primaryKey.includes(c.name),
      notNull: !c.nullable,
      ...(c.fk ? { references: { table: c.fk.table, column: c.fk.column } } : {}),
    })),
  }));
  const edges: ParsedSchema["edges"] = [];
  const warnings: string[] = [];
  for (const t of parsedTables) {
    for (const c of t.columns) {
      if (!c.references) continue;
      edges.push({ from: t.name, fromColumn: c.name, to: c.references.table, toColumn: c.references.column });
      if (!names.has(c.references.table)) {
        warnings.push(`${t.name}.${c.name} references ${c.references.table}, which is outside the selected schemas.`);
      }
    }
  }
  return { tables: parsedTables, edges, warnings };
}
