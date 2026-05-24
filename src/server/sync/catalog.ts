import "server-only";
import type postgres from "postgres";

/**
 * Authoritative schema introspection straight from `pg_catalog`. Unlike
 * `schema-introspect` (which parses the PostgREST OpenAPI spec and infers
 * FKs from column comments), this reads the real catalog: `pg_constraint`
 * for PK/FK, `pg_attribute.attidentity` / `attgenerated` for identity and
 * generated columns, `pg_class.reltuples` for row estimates. Sync needs
 * the truth, not a heuristic.
 *
 * Every function takes a postgres.js handle so the caller controls the
 * transaction — the base is always read inside a READ ONLY transaction
 * (see `safety.ts`).
 */

/** A postgres.js client or transaction handle. */
export type PgHandle =
  | postgres.Sql<Record<string, never>>
  | postgres.TransactionSql<Record<string, never>>;

/** Schemas that are never synced and never introspected for sync. */
export const NEVER_SYNC_SCHEMAS = ["auth", "storage", "vault", "realtime", "extensions"];

export type IdentityKind = "always" | "default" | null;

export interface ColumnMeta {
  name: string;
  ordinal: number;
  /** Fully-qualified Postgres type, e.g. `text`, `timestamp with time zone`. */
  dataType: string;
  notNull: boolean;
  /** Has a plain DEFAULT (excludes generation expressions). */
  hasDefault: boolean;
  /** DEFAULT expression text (null when none / when identity / generated). */
  defaultExpr: string | null;
  /** GENERATED ... AS IDENTITY. */
  identity: IdentityKind;
  /** GENERATED ALWAYS AS (...) STORED — cannot be inserted into. */
  generated: boolean;
  /** Generation expression text when `generated` is true. */
  generatedExpr: string | null;
}

export interface ConstraintMeta {
  name: string;
  /** p=primary u=unique c=check f=foreign. */
  type: "p" | "u" | "c" | "f";
  /** `pg_get_constraintdef` — the exact constraint clause. */
  def: string;
}

export interface IndexMeta {
  name: string;
  /** `pg_get_indexdef` — full CREATE INDEX statement. Excludes constraint-backed indexes. */
  def: string;
}

export interface TriggerMeta {
  name: string;
}

export interface FkMeta {
  name: string;
  columns: string[];
  refSchema: string;
  refTable: string;
  refColumns: string[];
  /** confdeltype char: a=no action r=restrict c=cascade n=set null d=set default */
  onDelete: string;
  deferrable: boolean;
}

export interface TableMeta {
  schema: string;
  name: string;
  /** `schema.name`, the key used everywhere a table is referenced. */
  qualified: string;
  columns: ColumnMeta[];
  primaryKey: string[];
  foreignKeys: FkMeta[];
  /** All constraints (p/u/c/f) with their exact definitions, for DDL generation. */
  constraints: ConstraintMeta[];
  /** Non-constraint-backed indexes, for DDL generation. */
  indexes: IndexMeta[];
  /** Non-internal (user) triggers — they fire during COPY, so a sync warns on them. */
  triggers: TriggerMeta[];
  rlsEnabled: boolean;
  /** pg_class.reltuples estimate (−1 / 0 if never analyzed). */
  estimatedRows: number;
}

export interface EnumMeta {
  schema: string;
  name: string;
  values: string[];
}

export interface DbCatalog {
  schemas: string[];
  tables: TableMeta[];
  enums: EnumMeta[];
}

export function qualify(schema: string, name: string): string {
  return `${schema}.${name}`;
}

interface TableRow {
  schema: string;
  name: string;
  rls_enabled: boolean;
  est_rows: string | number;
  oid: number;
}
interface ColumnRow {
  oid: number;
  name: string;
  ordinal: number;
  data_type: string;
  not_null: boolean;
  has_default: boolean;
  identity: string; // '' | 'a' | 'd'
  generated: string; // '' | 's'
}
interface PkRow {
  oid: number;
  column: string;
}
interface FkRow {
  oid: number;
  name: string;
  ref_schema: string;
  ref_table: string;
  deferrable: boolean;
  on_delete: string;
  local_columns: string[];
  ref_columns: string[];
}
interface EnumRow {
  schema: string;
  name: string;
  values: string[];
}
interface DefaultRow {
  oid: number;
  name: string;
  expr: string;
  generated: string; // '' | 's'
}
interface ConstraintRow {
  oid: number;
  name: string;
  type: "p" | "u" | "c" | "f";
  def: string;
}
interface IndexRow {
  oid: number;
  name: string;
  def: string;
}
interface TriggerRow {
  oid: number;
  name: string;
}

/**
 * Introspect every base table (relkind r/p) in the given schemas. Defaults
 * to `public`; `NEVER_SYNC_SCHEMAS` are filtered out even if passed.
 */
export async function introspectCatalog(
  handle: PgHandle,
  schemas: string[] = ["public"],
): Promise<DbCatalog> {
  const sql = handle as postgres.Sql<Record<string, never>>;
  const targetSchemas = schemas.filter((s) => !NEVER_SYNC_SCHEMAS.includes(s));
  if (targetSchemas.length === 0) {
    return { schemas: [], tables: [], enums: [] };
  }

  const [
    tableRows,
    columnRows,
    pkRows,
    fkRows,
    enumRows,
    defaultRows,
    constraintRows,
    indexRows,
    triggerRows,
  ] = await Promise.all([
    sql<TableRow[]>`
      SELECT c.oid::int AS oid,
             n.nspname AS schema,
             c.relname AS name,
             c.relrowsecurity AS rls_enabled,
             c.reltuples::bigint AS est_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND n.nspname = ANY(${targetSchemas})
      ORDER BY n.nspname, c.relname
    `,
    sql<ColumnRow[]>`
      SELECT a.attrelid::int AS oid,
             a.attname AS name,
             a.attnum AS ordinal,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             a.attnotnull AS not_null,
             (a.atthasdef AND a.attgenerated = '') AS has_default,
             a.attidentity AS identity,
             a.attgenerated AS generated
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND n.nspname = ANY(${targetSchemas})
      ORDER BY a.attrelid, a.attnum
    `,
    sql<PkRow[]>`
      SELECT con.conrelid::int AS oid, att.attname AS column
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
      WHERE con.contype = 'p' AND n.nspname = ANY(${targetSchemas})
      ORDER BY con.conrelid, u.ord
    `,
    sql<FkRow[]>`
      SELECT con.conrelid::int AS oid,
             con.conname AS name,
             rn.nspname AS ref_schema,
             rc.relname AS ref_table,
             con.condeferrable AS deferrable,
             con.confdeltype AS on_delete,
             (SELECT array_agg(att.attname ORDER BY u.ord)
                FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute att
                  ON att.attrelid = con.conrelid AND att.attnum = u.attnum
             ) AS local_columns,
             (SELECT array_agg(att.attname ORDER BY u.ord)
                FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute att
                  ON att.attrelid = con.confrelid AND att.attnum = u.attnum
             ) AS ref_columns
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class rc ON rc.oid = con.confrelid
      JOIN pg_namespace rn ON rn.oid = rc.relnamespace
      WHERE con.contype = 'f' AND n.nspname = ANY(${targetSchemas})
      ORDER BY con.conrelid, con.conname
    `,
    sql<EnumRow[]>`
      SELECT n.nspname AS schema,
             t.typname AS name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = ANY(${targetSchemas})
      GROUP BY n.nspname, t.typname
      ORDER BY n.nspname, t.typname
    `,
    sql<DefaultRow[]>`
      SELECT a.attrelid::int AS oid,
             a.attname AS name,
             pg_get_expr(ad.adbin, ad.adrelid) AS expr,
             a.attgenerated AS generated
      FROM pg_attrdef ad
      JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname = ANY(${targetSchemas})
    `,
    sql<ConstraintRow[]>`
      SELECT con.conrelid::int AS oid,
             con.conname AS name,
             con.contype AS type,
             pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype IN ('p', 'u', 'c', 'f') AND n.nspname = ANY(${targetSchemas})
      ORDER BY con.conrelid, con.contype, con.conname
    `,
    sql<IndexRow[]>`
      SELECT i.indrelid::int AS oid,
             ic.relname AS name,
             pg_get_indexdef(i.indexrelid) AS def
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY(${targetSchemas})
        AND NOT i.indisprimary
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid
        )
      ORDER BY i.indrelid, ic.relname
    `,
    sql<TriggerRow[]>`
      SELECT t.tgrelid::int AS oid, t.tgname AS name
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname = ANY(${targetSchemas})
      ORDER BY t.tgrelid, t.tgname
    `,
  ]);

  // default / generation expressions keyed by `${oid}:${column}`.
  const exprByKey = new Map<string, { defaultExpr: string | null; generatedExpr: string | null }>();
  for (const r of defaultRows) {
    const key = `${r.oid}:${r.name}`;
    if (r.generated === "s") exprByKey.set(key, { defaultExpr: null, generatedExpr: r.expr });
    else exprByKey.set(key, { defaultExpr: r.expr, generatedExpr: null });
  }

  const columnsByOid = new Map<number, ColumnMeta[]>();
  for (const r of columnRows) {
    const list = columnsByOid.get(r.oid) ?? [];
    const expr = exprByKey.get(`${r.oid}:${r.name}`);
    list.push({
      name: r.name,
      ordinal: r.ordinal,
      dataType: r.data_type,
      notNull: r.not_null,
      hasDefault: r.has_default,
      defaultExpr: expr?.defaultExpr ?? null,
      identity: r.identity === "a" ? "always" : r.identity === "d" ? "default" : null,
      generated: r.generated === "s",
      generatedExpr: expr?.generatedExpr ?? null,
    });
    columnsByOid.set(r.oid, list);
  }

  const constraintsByOid = new Map<number, ConstraintMeta[]>();
  for (const r of constraintRows) {
    const list = constraintsByOid.get(r.oid) ?? [];
    list.push({ name: r.name, type: r.type, def: r.def });
    constraintsByOid.set(r.oid, list);
  }

  const indexesByOid = new Map<number, IndexMeta[]>();
  for (const r of indexRows) {
    const list = indexesByOid.get(r.oid) ?? [];
    list.push({ name: r.name, def: r.def });
    indexesByOid.set(r.oid, list);
  }

  const triggersByOid = new Map<number, TriggerMeta[]>();
  for (const r of triggerRows) {
    const list = triggersByOid.get(r.oid) ?? [];
    list.push({ name: r.name });
    triggersByOid.set(r.oid, list);
  }

  const pkByOid = new Map<number, string[]>();
  for (const r of pkRows) {
    const list = pkByOid.get(r.oid) ?? [];
    list.push(r.column);
    pkByOid.set(r.oid, list);
  }

  const fkByOid = new Map<number, FkMeta[]>();
  for (const r of fkRows) {
    const list = fkByOid.get(r.oid) ?? [];
    list.push({
      name: r.name,
      columns: r.local_columns ?? [],
      refSchema: r.ref_schema,
      refTable: r.ref_table,
      refColumns: r.ref_columns ?? [],
      onDelete: r.on_delete,
      deferrable: r.deferrable,
    });
    fkByOid.set(r.oid, list);
  }

  const tables: TableMeta[] = tableRows.map((t) => ({
    schema: t.schema,
    name: t.name,
    qualified: qualify(t.schema, t.name),
    columns: columnsByOid.get(t.oid) ?? [],
    primaryKey: pkByOid.get(t.oid) ?? [],
    foreignKeys: fkByOid.get(t.oid) ?? [],
    constraints: constraintsByOid.get(t.oid) ?? [],
    indexes: indexesByOid.get(t.oid) ?? [],
    triggers: triggersByOid.get(t.oid) ?? [],
    rlsEnabled: t.rls_enabled,
    estimatedRows: Math.max(0, Number(t.est_rows) || 0),
  }));

  const enums: EnumMeta[] = enumRows.map((e) => ({
    schema: e.schema,
    name: e.name,
    values: e.values ?? [],
  }));

  return { schemas: targetSchemas, tables, enums };
}

/** Columns that can actually be written by an INSERT (skips generated cols). */
export function insertableColumns(table: TableMeta): ColumnMeta[] {
  return table.columns.filter((c) => !c.generated);
}

/** True when the table has any GENERATED ALWAYS AS IDENTITY column. */
export function hasAlwaysIdentity(table: TableMeta): boolean {
  return table.columns.some((c) => c.identity === "always" && !c.generated);
}
