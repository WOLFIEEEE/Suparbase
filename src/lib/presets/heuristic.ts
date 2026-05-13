import type { Table } from "@/lib/types/schema";
import type { TableAnalysis, TableCategory } from "@/lib/types/analysis";

const USERS_NAME_RE = /^(users|profiles|members|accounts|people|customers|admins?)$/i;
const LOGS_NAME_RE = /^(events?|logs?|activit(?:y|ies)|audit(?:_?log)?|history|webhooks?)$/i;
const CONTENT_NAME_RE = /^(posts|articles|pages|blog.*|stories|news|docs|documents)$/i;

const EMAIL_LIKE_RE = /^(email|user_?name|username|handle|login)$/i;
const TITLE_LIKE_RE = /^(title|headline|name|subject)$/i;
const STATUS_LIKE_RE = /^(status|state|kind|type|stage|phase)$/i;
const BODY_LIKE_RE = /^(body|content|markdown|html|description|excerpt)$/i;
const EVENT_LIKE_RE = /^(event|event_type|action|verb|operation)$/i;

function toTitleCase(name: string): string {
  return name
    .split(/[_\s]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function findColumn(table: Table, re: RegExp): string | null {
  const col = table.columns.find((c) => re.test(c.name));
  return col?.name ?? null;
}

function pickListColumns(table: Table): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const col of table.columns) {
    if (col.isPrimaryKey && !seen.has(col.name)) {
      out.push(col.name);
      seen.add(col.name);
      break;
    }
  }
  const candidates = ["title", "name", "email", "username", "handle", "slug"];
  for (const cand of candidates) {
    const col = table.columns.find((c) => c.name.toLowerCase() === cand);
    if (col && !seen.has(col.name)) {
      out.push(col.name);
      seen.add(col.name);
    }
  }
  for (const c of table.columns) {
    if (out.length >= 6) break;
    if (seen.has(c.name)) continue;
    if (c.category === "string" || c.category === "text" || c.category === "boolean" || c.category === "enum") {
      out.push(c.name);
      seen.add(c.name);
    }
  }
  for (const meta of ["created_at", "updated_at"]) {
    if (out.length >= 6) break;
    const col = table.columns.find((c) => c.name.toLowerCase() === meta);
    if (col && !seen.has(col.name)) {
      out.push(col.name);
      seen.add(col.name);
    }
  }
  return out;
}

export function heuristicCategory(table: Table): TableCategory {
  if (USERS_NAME_RE.test(table.name) && table.columns.some((c) => EMAIL_LIKE_RE.test(c.name))) {
    return "users";
  }
  if (LOGS_NAME_RE.test(table.name)) {
    return "logs";
  }
  if (table.columns.some((c) => EVENT_LIKE_RE.test(c.name)) && table.columns.some((c) => c.name.toLowerCase() === "created_at")) {
    return "logs";
  }
  if (CONTENT_NAME_RE.test(table.name)) {
    return "content";
  }
  const hasTitle = table.columns.some((c) => TITLE_LIKE_RE.test(c.name));
  const hasBody = table.columns.some((c) => BODY_LIKE_RE.test(c.name));
  if (hasTitle && hasBody) return "content";
  return "generic";
}

export function heuristicAnalysisFor(table: Table): TableAnalysis {
  const category = heuristicCategory(table);
  return {
    schema: table.schema,
    name: table.name,
    category,
    displayName: toTitleCase(table.name),
    listColumns: pickListColumns(table),
    titleColumn: findColumn(table, TITLE_LIKE_RE) ?? findColumn(table, EMAIL_LIKE_RE),
    statusColumn: findColumn(table, STATUS_LIKE_RE),
    notes: `Heuristic: ${category}`,
  };
}
