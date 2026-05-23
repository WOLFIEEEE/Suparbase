import "server-only";
import type { ColumnMeta, ConstraintMeta, EnumMeta, IndexMeta, TableMeta } from "./catalog";
import { quoteIdent, quoteLiteral, tableIdent } from "./sql-util";

/**
 * Emit DDL from catalog metadata. Definitions for constraints and indexes
 * reuse Postgres's own `pg_get_constraintdef` / `pg_get_indexdef` strings
 * (captured in `catalog.ts`) rather than being reconstructed — far less to
 * get wrong. Only column clauses and CREATE TABLE scaffolding are built here.
 */

interface ColumnClauseOpts {
  /** Force the column nullable (used when adding to a populated table). */
  nullable?: boolean;
}

export function columnClause(col: ColumnMeta, opts: ColumnClauseOpts = {}): string {
  let s = `${quoteIdent(col.name)} ${col.dataType}`;
  if (col.generated && col.generatedExpr) {
    s += ` GENERATED ALWAYS AS (${col.generatedExpr}) STORED`;
  } else if (col.identity) {
    s += ` GENERATED ${col.identity === "always" ? "ALWAYS" : "BY DEFAULT"} AS IDENTITY`;
  } else if (col.defaultExpr) {
    s += ` DEFAULT ${col.defaultExpr}`;
  }
  const nullable = opts.nullable ?? !col.notNull;
  // Generated columns are implicitly NOT NULL-constrained by their expression;
  // never emit an explicit NOT NULL for them.
  if (!nullable && !col.generated) s += " NOT NULL";
  return s;
}

export function createTable(table: TableMeta): string {
  const cols = table.columns.map((c) => `  ${columnClause(c)}`).join(",\n");
  const pk = table.constraints.find((c) => c.type === "p");
  const pkClause = pk ? `,\n  CONSTRAINT ${quoteIdent(pk.name)} ${pk.def}` : "";
  return `CREATE TABLE IF NOT EXISTS ${tableIdent(table.schema, table.name)} (\n${cols}${pkClause}\n)`;
}

export function addColumn(table: TableMeta, col: ColumnMeta): string {
  // Always add nullable; a deferred SET NOT NULL runs after the data load so
  // adding to a (briefly) populated table can't fail.
  return `ALTER TABLE ${tableIdent(table.schema, table.name)} ADD COLUMN IF NOT EXISTS ${columnClause(col, { nullable: true })}`;
}

export function setNotNull(table: TableMeta, columnName: string): string {
  return `ALTER TABLE ${tableIdent(table.schema, table.name)} ALTER COLUMN ${quoteIdent(columnName)} SET NOT NULL`;
}

export function addConstraint(table: TableMeta, c: ConstraintMeta): string {
  return `ALTER TABLE ${tableIdent(table.schema, table.name)} ADD CONSTRAINT ${quoteIdent(c.name)} ${c.def}`;
}

export function createIndex(index: IndexMeta): string {
  return index.def;
}

export function createEnum(e: EnumMeta): string {
  const values = e.values.map(quoteLiteral).join(", ");
  return `CREATE TYPE ${tableIdent(e.schema, e.name)} AS ENUM (${values})`;
}

export function addEnumValue(e: EnumMeta, value: string): string {
  return `ALTER TYPE ${tableIdent(e.schema, e.name)} ADD VALUE IF NOT EXISTS ${quoteLiteral(value)}`;
}

export function dropColumn(table: TableMeta, columnName: string): string {
  return `ALTER TABLE ${tableIdent(table.schema, table.name)} DROP COLUMN IF EXISTS ${quoteIdent(columnName)}`;
}

export function dropTable(schema: string, name: string): string {
  return `DROP TABLE IF EXISTS ${tableIdent(schema, name)} CASCADE`;
}
