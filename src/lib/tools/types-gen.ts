import { parseDdl, type ParsedColumn, type ParsedTable } from "./ddl";

/**
 * Turn Postgres DDL into TypeScript interfaces or Zod schemas for the free
 * `/tools/schema-to-typescript` page. Reuses the DDL parser behind the ERD
 * visualizer, so the same paste that draws a diagram also produces types.
 * Pure and client-side: nothing is uploaded.
 */

export type TypeTarget = "typescript" | "zod";

export interface GenerateTypesInput {
  ddl: string;
  target: TypeTarget;
}

export interface GenerateTypesResult {
  code: string;
  tableCount: number;
  warnings: string[];
}

/** Map a Postgres column type to a TypeScript type and a Zod validator. */
function mapType(pgType: string): { ts: string; zod: string } {
  const raw = pgType.toLowerCase().trim();
  // Array either as `type[]` or the internal `_type` form.
  const isArray = /\[\]$/.test(raw) || /^_/.test(raw);
  const base = raw
    .replace(/\[\]$/, "")
    .replace(/^_/, "")
    .replace(/\(.*\)$/, "")
    .replace(/\s+/g, " ")
    .trim();

  let ts: string;
  let zod: string;

  if (/^(uuid|text|varchar|character varying|character|char|bpchar|citext|name|inet|cidr|macaddr|xml|money|tsvector|ltree)$/.test(base)) {
    ts = "string";
    zod = "z.string()";
  } else if (
    /^(int2|int4|int8|smallint|integer|int|bigint|serial|bigserial|smallserial|numeric|decimal|real|double precision|float4|float8|float|oid)$/.test(base)
  ) {
    ts = "number";
    zod = "z.number()";
  } else if (/^(bool|boolean)$/.test(base)) {
    ts = "boolean";
    zod = "z.boolean()";
  } else if (/^(json|jsonb)$/.test(base)) {
    ts = "unknown";
    zod = "z.unknown()";
  } else if (
    /^(timestamp|timestamptz|timestamp with time zone|timestamp without time zone|date|time|timetz|time with time zone|time without time zone|interval)$/.test(base)
  ) {
    ts = "string";
    zod = "z.string()";
  } else if (base === "bytea") {
    ts = "string";
    zod = "z.string()";
  } else if (base === "vector") {
    ts = "number[]";
    zod = "z.array(z.number())";
  } else {
    ts = "unknown";
    zod = "z.unknown()";
  }

  if (isArray) {
    ts = ts.endsWith("[]") ? `${ts}[]` : `${ts}[]`;
    zod = `z.array(${zod})`;
  }
  return { ts, zod };
}

function pascalCase(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  // A type name can't start with a digit.
  return /^[0-9]/.test(pascal) ? `T${pascal}` : pascal || "Row";
}

const VALID_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function propKey(name: string): string {
  return VALID_IDENT.test(name) ? name : JSON.stringify(name);
}

function tsProperty(col: ParsedColumn): string {
  const { ts } = mapType(col.type);
  const value = col.notNull ? ts : `${ts} | null`;
  return `  ${propKey(col.name)}: ${value};`;
}

function zodProperty(col: ParsedColumn): string {
  const { zod } = mapType(col.type);
  const value = col.notNull ? zod : `${zod}.nullable()`;
  return `  ${propKey(col.name)}: ${value},`;
}

export function generateTypes(input: GenerateTypesInput): GenerateTypesResult {
  const parsed = parseDdl(input.ddl);
  return generateTypesFromTables(parsed.tables, input.target, parsed.warnings);
}

/**
 * Same generator, fed with already-parsed tables. The workspace Schema page
 * uses this with the live introspected schema (via `schemaToParsed`).
 */
export function generateTypesFromTables(
  allTables: ParsedTable[],
  target: TypeTarget,
  warnings: string[] = [],
): GenerateTypesResult {
  const tables = allTables.filter((t) => t.columns.length > 0);

  if (tables.length === 0) {
    return { code: "", tableCount: 0, warnings };
  }

  if (target === "zod") {
    const blocks = tables.map((t) => {
      const name = pascalCase(t.name);
      const lines = t.columns.map(zodProperty).join("\n");
      return `export const ${name.charAt(0).toLowerCase() + name.slice(1)}Schema = z.object({\n${lines}\n});\nexport type ${name} = z.infer<typeof ${name.charAt(0).toLowerCase() + name.slice(1)}Schema>;`;
    });
    const code = `import { z } from "zod";\n\n${blocks.join("\n\n")}\n`;
    return { code, tableCount: tables.length, warnings };
  }

  const blocks = tables.map((t) => {
    const name = pascalCase(t.name);
    const lines = t.columns.map(tsProperty).join("\n");
    return `export interface ${name} {\n${lines}\n}`;
  });
  const code = `${blocks.join("\n\n")}\n`;
  return { code, tableCount: tables.length, warnings };
}
