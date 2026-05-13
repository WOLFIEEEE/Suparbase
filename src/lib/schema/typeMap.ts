import type { ColumnTypeCategory } from "./types";
import type { OpenAPIProperty } from "@/lib/supabase/openapi";

const PG_TYPE_MAP: Record<string, ColumnTypeCategory> = {
  uuid: "uuid",
  boolean: "boolean",
  bool: "boolean",
  smallint: "integer",
  integer: "integer",
  bigint: "integer",
  int: "integer",
  int2: "integer",
  int4: "integer",
  int8: "integer",
  real: "float",
  "double precision": "float",
  float4: "float",
  float8: "float",
  numeric: "float",
  decimal: "float",
  date: "date",
  time: "string",
  "time without time zone": "string",
  "time with time zone": "string",
  timestamp: "datetime",
  "timestamp without time zone": "datetime",
  "timestamp with time zone": "datetime",
  timestamptz: "datetime",
  json: "json",
  jsonb: "json",
  text: "text",
  "character varying": "string",
  varchar: "string",
  bpchar: "string",
  char: "string",
  "character": "string",
};

export function typeCategoryOf(pgType: string, property: OpenAPIProperty): ColumnTypeCategory {
  if (property.enum && property.enum.length > 0) return "enum";
  const normalized = pgType.toLowerCase().trim();
  return PG_TYPE_MAP[normalized] ?? "unknown";
}

export function rawPgTypeOf(property: OpenAPIProperty): string {
  // PostgREST puts the postgres type in `format`. Fall back to JSON `type`.
  return (property.format ?? property.type ?? "unknown").toString();
}
