/**
 * Best-effort Postgres DDL parser for the free `/tools/schema-visualizer`
 * page. Parses `CREATE TABLE` statements (columns, PK, FK / REFERENCES) into
 * a small graph the ERD renderer can lay out. Pure + client-side: pasted
 * SQL never leaves the browser. Not a full SQL parser, just tuned for pasted
 * schemas and `pg_dump` output.
 */

export interface ParsedColumn {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  notNull: boolean;
  /** Set when this column references another table. */
  references?: { table: string; column: string };
}

export interface ParsedTable {
  schema: string;
  name: string;
  columns: ParsedColumn[];
}

export interface ParsedSchema {
  tables: ParsedTable[];
  /** FK edges: from `${schema}.${table}` → `${refTable}`. */
  edges: Array<{ from: string; fromColumn: string; to: string; toColumn: string }>;
  warnings: string[];
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/--[^\n]*/g, " "); // line comments
}

function unquote(id: string): string {
  const t = id.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

/** Split a comma-separated column/constraint list respecting parentheses. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const CONSTRAINT_KEYWORDS = /^(primary|foreign|unique|constraint|check|exclude)\b/i;

// Multi-word Postgres types that must be captured whole, before the parser
// stops at the first modifier keyword (NOT, PRIMARY, DEFAULT, REFERENCES, …).
const MULTIWORD_TYPE =
  /^(timestamp with time zone|timestamp without time zone|time with time zone|time without time zone|double precision|character varying|bit varying)/i;

/**
 * Pull the column type off the front of a definition. Handles a leading
 * multi-word type, an optional precision like `numeric(10,2)`, and a
 * trailing array marker, then stops, so modifiers such as `NOT NULL` or
 * `PRIMARY KEY` never leak into the type string.
 */
function extractType(rest: string): string {
  const s = rest.trim();
  const mw = s.match(MULTIWORD_TYPE);
  let type: string;
  let consumed: number;
  if (mw) {
    type = mw[1]!;
    consumed = mw[1]!.length;
  } else {
    const tm = s.match(/^("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)(\s*\([^)]*\))?/);
    if (!tm) return "unknown";
    type = (tm[1]! + (tm[2] ? tm[2].replace(/\s+/g, "") : "")).replace(/"/g, "");
    consumed = tm[0].length;
  }
  if (/^\s*\[\]/.test(s.slice(consumed))) type += "[]";
  return type;
}

export function parseDdl(sql: string): ParsedSchema {
  const clean = stripComments(sql);
  const tables: ParsedTable[] = [];
  const warnings: string[] = [];

  // Match CREATE TABLE [IF NOT EXISTS] [schema.]name ( … );  (balanced-ish)
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_."]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const rawName = m[1]!;
    const dot = rawName.replace(/"/g, "").split(".");
    const schema = dot.length > 1 ? dot[0]! : "public";
    const name = dot.length > 1 ? dot.slice(1).join(".") : dot[0]!;

    // Find the matching close paren for the column list.
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    while (i < clean.length && depth > 0) {
      if (clean[i] === "(") depth++;
      else if (clean[i] === ")") depth--;
      i++;
    }
    const body = clean.slice(start, i - 1);
    re.lastIndex = i;

    const columns: ParsedColumn[] = [];
    const pkCols = new Set<string>();

    for (const part of splitTopLevel(body)) {
      const line = part.trim();
      if (!line) continue;

      if (CONSTRAINT_KEYWORDS.test(line)) {
        // Table-level constraints: PRIMARY KEY (a, b) / FOREIGN KEY (x) REFERENCES t(y)
        const pk = line.match(/primary\s+key\s*\(([^)]+)\)/i);
        if (pk) pk[1]!.split(",").forEach((c) => pkCols.add(unquote(c)));
        const fk = line.match(/foreign\s+key\s*\(([^)]+)\)\s*references\s+([a-zA-Z0-9_."]+)\s*\(([^)]+)\)/i);
        if (fk) {
          const col = unquote(fk[1]!.split(",")[0]!);
          const target = unquote(fk[2]!).split(".").pop()!;
          const targetCol = unquote(fk[3]!.split(",")[0]!);
          const existing = columns.find((c) => c.name === col);
          if (existing) existing.references = { table: target, column: targetCol };
        }
        continue;
      }

      // Column definition: name type [modifiers…]
      const colMatch = line.match(/^("(?:[^"]|"")+"|[a-zA-Z_][a-zA-Z0-9_$]*)\s+(.+)$/);
      if (!colMatch) continue;
      const colName = unquote(colMatch[1]!);
      const rest = colMatch[2]!;
      const type = extractType(rest);

      const col: ParsedColumn = {
        name: colName,
        type,
        isPrimaryKey: /\bprimary\s+key\b/i.test(rest),
        notNull: /\bnot\s+null\b/i.test(rest) || /\bprimary\s+key\b/i.test(rest),
      };
      if (col.isPrimaryKey) pkCols.add(colName);

      // Inline REFERENCES target(col)
      const ref = rest.match(/references\s+([a-zA-Z0-9_."]+)\s*(?:\(([^)]+)\))?/i);
      if (ref) {
        const target = unquote(ref[1]!).split(".").pop()!;
        const targetCol = ref[2] ? unquote(ref[2].split(",")[0]!) : "id";
        col.references = { table: target, column: targetCol };
      }
      columns.push(col);
    }

    for (const c of columns) if (pkCols.has(c.name)) c.isPrimaryKey = true;
    if (columns.length === 0) {
      warnings.push(`Table "${name}" parsed with no columns. Check its DDL syntax.`);
    }
    tables.push({ schema, name, columns });
  }

  // Build edges; only keep edges whose target table we actually parsed.
  const tableNames = new Set(tables.map((t) => t.name));
  const edges: ParsedSchema["edges"] = [];
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.references) {
        edges.push({
          from: t.name,
          fromColumn: c.name,
          to: c.references.table,
          toColumn: c.references.column,
        });
        if (!tableNames.has(c.references.table)) {
          warnings.push(`${t.name}.${c.name} references "${c.references.table}", which isn't in the pasted DDL.`);
        }
      }
    }
  }

  if (tables.length === 0) {
    warnings.push("No CREATE TABLE statements found. Paste Postgres DDL (e.g. from the Supabase SQL editor or pg_dump).");
  }

  return { tables, edges, warnings };
}
