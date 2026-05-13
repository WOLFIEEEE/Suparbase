export type ColumnTypeCategory =
  | "string"
  | "text"
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "uuid"
  | "json"
  | "enum"
  | "unknown";

export interface ForeignKey {
  schema: string;
  table: string;
  column: string;
}

export interface Column {
  name: string;
  pgType: string;
  category: ColumnTypeCategory;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isGenerated: boolean;
  enumValues?: string[];
  fk?: ForeignKey;
  comment?: string;
  maxLength?: number;
}

export type TableKind = "table" | "view";

export interface Table {
  schema: string;
  name: string;
  kind: TableKind;
  columns: Column[];
  primaryKey: string[];
  labelColumn: string | null;
}

export interface Schema {
  introspectedAt: number;
  hostname: string;
  tables: Table[];
}

export type Row = Record<string, unknown>;

export type PrimaryKeyValue = Record<string, unknown>;
