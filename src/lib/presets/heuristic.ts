import type { Table } from "@/lib/types/schema";
import type { TableAnalysis, TableAnalysisRelation, TableCategory } from "@/lib/types/analysis";

const USERS_NAME_RE = /^(users|profiles|members|accounts|people|customers|admins?)$/i;
const LOGS_NAME_RE = /^(events?|logs?|activit(?:y|ies)|audit(?:_?log)?|history|webhooks?)$/i;
const CONTENT_NAME_RE = /^(posts|articles|pages|blog.*|stories|news|docs|documents)$/i;

const EMAIL_LIKE_RE = /^(email|user_?name|username|handle|login)$/i;
const TITLE_LIKE_RE = /^(title|headline|name|subject)$/i;
const STATUS_LIKE_RE = /^(status|state|kind|type|stage|phase)$/i;
const BODY_LIKE_RE = /^(body|content|markdown|html|description|excerpt)$/i;
const EVENT_LIKE_RE = /^(event|event_type|action|verb|operation)$/i;
const AVATAR_LIKE_RE = /^(avatar(_url)?|image(_url)?|photo(_url)?|picture)$/i;
const DISPLAY_NAME_LIKE_RE = /^(display_name|full_name|name)$/i;
const ROLE_LIKE_RE = /^(role|tier|kind|type)$/i;

// Columns we never want to surface by default.
const ALWAYS_HIDDEN_RE = /^(password_hash|password_digest|encrypted_password|salt|mfa_secret|confirmation_token|recovery_token|reauthentication_token|refresh_token|email_change_token|phone_change_token|raw_app_meta_data|raw_user_meta_data|aud|instance_id|providers|identity_data|banned_until|email_confirm(ed)?_at|phone_confirmed_at)$/i;
const HIDDEN_SUFFIX_RE = /(_token|_secret|_hash|_digest)$/i;

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

function pickPrimary(table: Table, category: TableCategory) {
  const display = findColumn(table, DISPLAY_NAME_LIKE_RE);
  const title = findColumn(table, TITLE_LIKE_RE);
  const email = findColumn(table, EMAIL_LIKE_RE);
  const avatar = findColumn(table, AVATAR_LIKE_RE);
  const status = findColumn(table, STATUS_LIKE_RE);
  const role = findColumn(table, ROLE_LIKE_RE);

  let titleColumn: string | null = null;
  let subtitleColumn: string | null = null;
  if (category === "users") {
    titleColumn = display ?? email ?? title;
    subtitleColumn = email && email !== titleColumn ? email : null;
  } else if (category === "content") {
    titleColumn = title ?? display;
    const slug = table.columns.find((c) => c.name.toLowerCase() === "slug")?.name;
    subtitleColumn = slug ?? null;
  } else {
    titleColumn = title ?? display ?? email;
  }
  return {
    titleColumn,
    subtitleColumn,
    avatarColumn: avatar,
    badgeColumn: status ?? role,
  };
}

function pickHiddenColumns(table: Table): string[] {
  const out: string[] = [];
  for (const c of table.columns) {
    if (c.isPrimaryKey) continue;
    if (ALWAYS_HIDDEN_RE.test(c.name) || HIDDEN_SUFFIX_RE.test(c.name)) {
      out.push(c.name);
    }
  }
  return out;
}

function pickRelations(table: Table): TableAnalysisRelation[] {
  const out: TableAnalysisRelation[] = [];
  for (const c of table.columns) {
    if (!c.fk) continue;
    const refTable = c.fk.table;
    const singular = refTable.endsWith("s") ? refTable.slice(0, -1) : refTable;
    const label = toTitleCase(singular);
    // Default: meaningful FK columns are shown inline; bookkeeping FKs are link-only.
    const lower = c.name.toLowerCase();
    const showOnDetail = !(
      lower.startsWith("created_by") ||
      lower.startsWith("updated_by") ||
      lower.endsWith("_by") ||
      lower.endsWith("_by_id")
    );
    out.push({ fkColumn: c.name, label, showOnDetail });
  }
  return out;
}

export function heuristicAnalysisFor(table: Table): TableAnalysis {
  const category = heuristicCategory(table);
  const primary = pickPrimary(table, category);
  return {
    schema: table.schema,
    name: table.name,
    category,
    displayName: toTitleCase(table.name),
    listColumns: pickListColumns(table),
    titleColumn: primary.titleColumn,
    statusColumn: findColumn(table, STATUS_LIKE_RE),
    notes: `Heuristic: ${category}`,
    primary,
    hiddenColumns: pickHiddenColumns(table),
    relations: pickRelations(table),
  };
}
