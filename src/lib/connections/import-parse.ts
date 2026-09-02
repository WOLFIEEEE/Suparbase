import type { ConnectionEnvironment } from "@/lib/types/connection";

/**
 * Parse a pasted JSON array or CSV into connection-import candidates. Pure
 * and client-side: the API keys never leave the browser until the user
 * confirms and each row is POSTed to the normal create endpoint.
 */

export interface ImportCandidate {
  index: number;
  name: string;
  url: string;
  key: string;
  postgresUrl: string | null;
  environment: ConnectionEnvironment | null;
  /** Validation problems; an empty array means the row can be submitted. */
  problems: string[];
}

const URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i;
const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PG_URL_REGEX = /^postgres(?:ql)?:\/\/.+/i;
const ENVS = new Set<string>(["production", "staging", "development", "other"]);
export const MAX_IMPORT_ROWS = 50;

const FIELD_ALIASES: Record<string, keyof RawRow> = {
  name: "name",
  display_name: "name",
  displayname: "name",
  label: "name",
  url: "url",
  project_url: "url",
  projecturl: "url",
  supabase_url: "url",
  key: "key",
  api_key: "key",
  apikey: "key",
  anon_key: "key",
  anonkey: "key",
  supabase_key: "key",
  postgres_url: "postgresUrl",
  postgresurl: "postgresUrl",
  database_url: "postgresUrl",
  pg_url: "postgresUrl",
  connection_string: "postgresUrl",
  environment: "environment",
  env: "environment",
};

interface RawRow {
  name?: unknown;
  url?: unknown;
  key?: unknown;
  postgresUrl?: unknown;
  environment?: unknown;
}

function normaliseKeys(obj: Record<string, unknown>): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(obj)) {
    const alias = FIELD_ALIASES[k.trim().toLowerCase()];
    if (alias) out[alias] = v;
  }
  return out;
}

/** Minimal RFC-4180 reader: quoted fields, escaped quotes, CRLF. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function toCandidate(raw: RawRow, index: number): ImportCandidate {
  const name = str(raw.name);
  const url = str(raw.url).replace(/\/$/, "");
  const key = str(raw.key);
  const pg = str(raw.postgresUrl);
  const envRaw = str(raw.environment).toLowerCase();
  const problems: string[] = [];
  if (!name) problems.push("name is required");
  else if (name.length > 60) problems.push("name must be 60 characters or fewer");
  if (!URL_REGEX.test(url)) problems.push("url must be a https://*.supabase.co project URL");
  if (!JWT_REGEX.test(key)) problems.push("key must be a JWT");
  if (pg && !PG_URL_REGEX.test(pg)) problems.push("postgresUrl must start with postgres://");
  if (envRaw && !ENVS.has(envRaw)) problems.push("environment must be production, staging, development, or other");
  return {
    index,
    name,
    url,
    key,
    postgresUrl: pg || null,
    environment: envRaw && ENVS.has(envRaw) ? (envRaw as ConnectionEnvironment) : null,
    problems,
  };
}

export interface ParseResult {
  candidates: ImportCandidate[];
  format: "json" | "csv" | "empty";
  error: string | null;
}

export function parseConnectionImport(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { candidates: [], format: "empty", error: null };

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { candidates: [], format: "json", error: "Invalid JSON." };
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { connections?: unknown }).connections)
        ? ((parsed as { connections: unknown[] }).connections)
        : null;
    if (!list) return { candidates: [], format: "json", error: "Expected a JSON array (or { connections: [...] })." };
    if (list.length > MAX_IMPORT_ROWS) {
      return { candidates: [], format: "json", error: `Too many rows (${list.length}); the limit is ${MAX_IMPORT_ROWS} per import.` };
    }
    const candidates = list.map((item, i) =>
      toCandidate(item && typeof item === "object" ? normaliseKeys(item as Record<string, unknown>) : {}, i),
    );
    return { candidates, format: "json", error: null };
  }

  const rows = parseCsvRows(trimmed);
  if (rows.length < 2) return { candidates: [], format: "csv", error: "CSV needs a header row plus at least one data row." };
  const header = rows[0]!.map((h) => h.trim());
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return { candidates: [], format: "csv", error: `Too many rows (${dataRows.length}); the limit is ${MAX_IMPORT_ROWS} per import.` };
  }
  const candidates = dataRows.map((cells, i) => {
    const obj: Record<string, unknown> = {};
    header.forEach((h, ci) => {
      obj[h] = cells[ci] ?? "";
    });
    return toCandidate(normaliseKeys(obj), i);
  });
  return { candidates, format: "csv", error: null };
}
