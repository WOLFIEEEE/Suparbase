import type { Connection } from "@/lib/connection/store";
import { fetchOpenAPI, type OpenAPIDefinition, type OpenAPIPathItem, type OpenAPIProperty } from "@/lib/supabase/openapi";
import type { Column, Schema, Table, TableKind } from "./types";
import { hasPkTag, parseFk, stripPostgrestTags } from "./fkParser";
import { pickLabelColumn } from "./labelColumn";
import { rawPgTypeOf, typeCategoryOf } from "./typeMap";

const GEN_DEFAULT_RE = /^(gen_random_uuid\(\)|uuid_generate_v4\(\)|now\(\)|current_timestamp|nextval\()/i;

export async function introspect(conn: Connection): Promise<Schema> {
  const doc = await fetchOpenAPI(conn);
  const definitions = doc.definitions ?? {};
  const paths = doc.paths ?? {};

  const tables: Table[] = [];
  for (const [name, def] of Object.entries(definitions)) {
    tables.push(buildTable(name, def, paths[`/${name}`]));
  }

  tables.sort((a, b) => a.name.localeCompare(b.name));

  return {
    introspectedAt: Date.now(),
    hostname: conn.hostname,
    tables,
  };
}

function buildTable(name: string, def: OpenAPIDefinition, pathItem: OpenAPIPathItem | undefined): Table {
  const required = new Set(def.required ?? []);
  const props = def.properties ?? {};
  const columns: Column[] = [];

  for (const [colName, prop] of Object.entries(props)) {
    columns.push(buildColumn(colName, prop, required.has(colName)));
  }

  const kind = inferKind(pathItem);
  const primaryKey = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  const labelColumn = pickLabelColumn(columns);

  return {
    schema: "public",
    name,
    kind,
    columns,
    primaryKey,
    labelColumn,
  };
}

function buildColumn(name: string, prop: OpenAPIProperty, isRequired: boolean): Column {
  const pgType = rawPgTypeOf(prop);
  const category = typeCategoryOf(pgType, prop);
  const description = prop.description;
  const fk = parseFk(description);
  const comment = stripPostgrestTags(description);
  const defaultValueRaw = prop.default;
  const defaultValue =
    defaultValueRaw === undefined || defaultValueRaw === null ? null : String(defaultValueRaw);
  const isPrimaryKey = hasPkTag(description);
  const generatedByDefault = defaultValue ? GEN_DEFAULT_RE.test(defaultValue.trim()) : false;
  const isGenerated = generatedByDefault || isPrimaryKey && generatedByDefault;

  // OpenAPI's "required" semantics: a property is required iff it is NOT nullable and has no default.
  // For our nullability purposes, treat a property absent from required as nullable when no default applies.
  const hasDefault = defaultValue !== null;
  const nullable = !isRequired && !hasDefault ? true : !isRequired;

  return {
    name,
    pgType,
    category,
    nullable,
    defaultValue,
    isPrimaryKey,
    isGenerated,
    enumValues: prop.enum && prop.enum.length > 0 ? [...prop.enum] : undefined,
    fk,
    comment,
    maxLength: prop.maxLength,
  };
}

function inferKind(pathItem: OpenAPIPathItem | undefined): TableKind {
  if (!pathItem) return "table";
  if (pathItem.post || pathItem.patch || pathItem.delete) return "table";
  return "view";
}
