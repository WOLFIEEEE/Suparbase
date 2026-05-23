import "server-only";

/** Quote a Postgres identifier (table / column name). */
export function quoteIdent(id: string): string {
  return `"${id.replaceAll('"', '""')}"`;
}

/** Quote a string as a Postgres literal (doubles embedded single quotes). */
export function quoteLiteral(s: string): string {
  return `'${s.replaceAll("'", "''")}'`;
}

/** `"schema"."table"`. */
export function tableIdent(schema: string, name: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}
