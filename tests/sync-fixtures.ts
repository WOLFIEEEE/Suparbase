import type {
  ColumnMeta,
  ConstraintMeta,
  DbCatalog,
  EnumMeta,
  FkMeta,
  TableMeta,
} from "@/server/sync/catalog";

/** Minimal column builder for sync tests. */
export function col(name: string, type = "text", opts: Partial<ColumnMeta> = {}): ColumnMeta {
  return {
    name,
    ordinal: 1,
    dataType: type,
    notNull: false,
    hasDefault: false,
    defaultExpr: null,
    identity: null,
    generated: false,
    generatedExpr: null,
    ...opts,
  };
}

export function fk(
  name: string,
  columns: string[],
  refTable: string,
  refColumns: string[],
  opts: Partial<FkMeta> = {},
): FkMeta {
  const [refSchema, refName] = refTable.includes(".")
    ? refTable.split(".")
    : ["public", refTable];
  return {
    name,
    columns,
    refSchema: refSchema!,
    refTable: refName!,
    refColumns,
    onDelete: "a",
    deferrable: false,
    ...opts,
  };
}

export function table(
  schema: string,
  name: string,
  columns: ColumnMeta[],
  opts: Partial<TableMeta> = {},
): TableMeta {
  return {
    schema,
    name,
    qualified: `${schema}.${name}`,
    columns,
    primaryKey: [],
    foreignKeys: [],
    constraints: [],
    indexes: [],
    triggers: [],
    rlsEnabled: false,
    estimatedRows: 0,
    ...opts,
  };
}

export function pkConstraint(name: string, cols: string[]): ConstraintMeta {
  return { name, type: "p", def: `PRIMARY KEY (${cols.join(", ")})` };
}

export function catalog(tables: TableMeta[], enums: EnumMeta[] = []): DbCatalog {
  return { schemas: ["public"], tables, enums };
}
