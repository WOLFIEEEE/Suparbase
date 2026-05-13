import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import { decryptKey } from "@/server/crypto/vault";
import type { Column, ColumnTypeCategory, ForeignKey, Schema, Table, TableKind } from "@/lib/types/schema";

interface OpenAPIProperty {
  type?: string;
  format?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  maxLength?: number;
}

interface OpenAPIDefinition {
  type?: "object";
  required?: string[];
  properties?: Record<string, OpenAPIProperty>;
}

interface OpenAPIPathItem {
  get?: unknown;
  post?: unknown;
  patch?: unknown;
  delete?: unknown;
}

interface OpenAPIDoc {
  definitions?: Record<string, OpenAPIDefinition>;
  paths?: Record<string, OpenAPIPathItem>;
}

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
  character: "string",
};

const MACHINE_TAG = /<fk\s+table=['"]([^'"]+)['"]\s+column=['"]([^'"]+)['"]\s*\/?\s*>/i;
const READABLE_QUALIFIED = /Foreign Key to\s+`?([\w$]+)\.([\w$]+)\.([\w$]+)`?/i;
const READABLE_UNQUALIFIED = /Foreign Key to\s+`?([\w$]+)\.([\w$]+)`?/i;
const GEN_DEFAULT_RE = /^(gen_random_uuid\(\)|uuid_generate_v4\(\)|now\(\)|current_timestamp|nextval\()/i;

const LABEL_PRIORITY = [
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

export async function introspectConnection(conn: ConnectionRow): Promise<Schema> {
  const key = decryptKey(conn.encryptedKey);
  const res = await fetch(`${conn.url}/rest/v1/`, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/openapi+json",
    },
  });
  if (res.status === 401) throw new IntrospectionError("unauthorized", "Key rejected by the project.");
  if (res.status === 403) throw new IntrospectionError("forbidden", "Key cannot access schema (RLS).");
  if (!res.ok) throw new IntrospectionError("server", `Supabase responded with ${res.status}.`);
  const doc = (await res.json()) as OpenAPIDoc;
  return parseOpenApi(doc, conn.hostname);
}

export class IntrospectionError extends Error {
  category: "unauthorized" | "forbidden" | "server" | "network";
  constructor(category: IntrospectionError["category"], message: string) {
    super(message);
    this.category = category;
  }
}

function parseOpenApi(doc: OpenAPIDoc, hostname: string): Schema {
  const definitions = doc.definitions ?? {};
  const paths = doc.paths ?? {};
  const tables: Table[] = [];
  for (const [name, def] of Object.entries(definitions)) {
    tables.push(buildTable(name, def, paths[`/${name}`]));
  }
  tables.sort((a, b) => a.name.localeCompare(b.name));
  return { introspectedAt: Date.now(), hostname, tables };
}

function buildTable(name: string, def: OpenAPIDefinition, pathItem: OpenAPIPathItem | undefined): Table {
  const required = new Set(def.required ?? []);
  const props = def.properties ?? {};
  const columns: Column[] = [];

  for (const [colName, prop] of Object.entries(props)) {
    columns.push(buildColumn(colName, prop, required.has(colName)));
  }

  const kind: TableKind = pathItem?.post || pathItem?.patch || pathItem?.delete ? "table" : "view";
  const primaryKey = derivePrimaryKey(columns);
  const pkSet = new Set(primaryKey);
  for (const c of columns) if (pkSet.has(c.name)) c.isPrimaryKey = true;
  return {
    schema: "public",
    name,
    kind,
    columns,
    primaryKey,
    labelColumn: pickLabelColumn(columns),
  };
}

function buildColumn(name: string, prop: OpenAPIProperty, isRequired: boolean): Column {
  const pgType = (prop.format ?? prop.type ?? "unknown").toString();
  const description = prop.description;
  const fk = parseFk(description);
  const comment = stripPostgrestTags(description);
  const defaultValue =
    prop.default === undefined || prop.default === null ? null : String(prop.default);
  const isPrimaryKey = hasPkTag(description);
  const isGenerated = defaultValue ? GEN_DEFAULT_RE.test(defaultValue.trim()) : false;
  const hasDefault = defaultValue !== null;
  const nullable = !isRequired && !hasDefault ? true : !isRequired;

  return {
    name,
    pgType,
    category: typeCategoryOf(pgType, prop),
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

function typeCategoryOf(pgType: string, prop: OpenAPIProperty): ColumnTypeCategory {
  if (prop.enum && prop.enum.length > 0) return "enum";
  return PG_TYPE_MAP[pgType.toLowerCase().trim()] ?? "unknown";
}

function parseFk(description: string | undefined): ForeignKey | undefined {
  if (!description) return undefined;
  const machine = description.match(MACHINE_TAG);
  if (machine) {
    const tableSpec = machine[1];
    const column = machine[2];
    if (tableSpec && column) {
      const dotIndex = tableSpec.indexOf(".");
      if (dotIndex > 0) return { schema: tableSpec.slice(0, dotIndex), table: tableSpec.slice(dotIndex + 1), column };
      return { schema: "public", table: tableSpec, column };
    }
  }
  const qualified = description.match(READABLE_QUALIFIED);
  if (qualified) {
    const [, schema, table, column] = qualified;
    if (schema && table && column) return { schema, table, column };
  }
  const unqualified = description.match(READABLE_UNQUALIFIED);
  if (unqualified) {
    const [, table, column] = unqualified;
    if (table && column) return { schema: "public", table, column };
  }
  return undefined;
}

function stripPostgrestTags(description: string | undefined): string | undefined {
  if (!description) return undefined;
  return (
    description
      .replace(MACHINE_TAG, "")
      .replace(/<pk\s*\/?\s*>/gi, "")
      .replace(/<gen\s*\/?\s*>/gi, "")
      .replace(/Note:\s*\n?/i, "")
      .replace(/This is a Foreign Key to[^\n]*/i, "")
      .trim() || undefined
  );
}

function hasPkTag(description: string | undefined): boolean {
  if (!description) return false;
  return /<pk\s*\/?\s*>/i.test(description);
}

function derivePrimaryKey(columns: Column[]): string[] {
  const tagged = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  if (tagged.length > 0) return tagged;
  const idCol = columns.find((c) => c.name.toLowerCase() === "id");
  if (idCol) return [idCol.name];
  const generatedUuid = columns.filter((c) => c.category === "uuid" && c.isGenerated);
  if (generatedUuid.length === 1) return [generatedUuid[0]!.name];
  const generatedInts = columns.filter((c) => c.category === "integer" && c.isGenerated);
  if (generatedInts.length === 1) return [generatedInts[0]!.name];
  return [];
}

function pickLabelColumn(columns: Column[]): string | null {
  const byName = new Map<string, Column>();
  for (const c of columns) byName.set(c.name.toLowerCase(), c);
  for (const cand of LABEL_PRIORITY) {
    const col = byName.get(cand);
    if (col && (col.category === "string" || col.category === "text")) return col.name;
  }
  const pks = columns.filter((c) => c.isPrimaryKey);
  if (pks.length === 1) {
    const pk = pks[0]!;
    if (pk.category === "string" || pk.category === "text" || pk.category === "uuid") return pk.name;
  }
  return null;
}
