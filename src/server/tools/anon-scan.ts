import "server-only";

/**
 * Stateless anon-probe for the free public Security Scanner
 * (`/tools/supabase-security-scanner`). Mirrors the anon-read channel of
 * Agent Sentry (`src/server/sentry/probe.ts`) but touches NO database, needs
 * no ConnectionRow, and never persists the URL, key, or results. Everything
 * here is derived from one request and discarded.
 *
 * The anon key is public by design (it ships in every client bundle), so
 * probing a project with it is honest: it reports exactly what an
 * unauthenticated visitor to that project could already read.
 */

const OPENAPI_TIMEOUT_MS = 8_000;
const PROBE_TIMEOUT_MS = 6_000;
const PROBE_LIMIT = 1;
/** Cap tables per scan so one request can't fan out into hundreds of fetches. */
export const MAX_TABLES_PER_SCAN = 40;
/** Concurrency for the per-table probes. */
const PROBE_CONCURRENCY = 8;

/** Hosted Supabase domains only — also the SSRF guard for this public route. */
const SUPABASE_HOST_RE = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i;

const PII_PATTERNS: Array<{ rx: RegExp; label: string }> = [
  { rx: /(^|_)password($|_)/i, label: "password" },
  { rx: /(^|_)secret($|_)/i, label: "secret" },
  { rx: /(^|_)(api[_-]?key|access[_-]?key|refresh[_-]?token|access[_-]?token)($|_)/i, label: "api-key" },
  { rx: /(^|_)(ssn|tax_?id|national_?id)($|_)/i, label: "national-id" },
  { rx: /(^|_)credit[_-]?card($|_)/i, label: "credit-card" },
  { rx: /(^|_)(stripe|paypal|braintree)[_-]?(key|secret|token)($|_)/i, label: "payment-key" },
  { rx: /(^|_)(phone|phone_number)($|_)/i, label: "phone" },
  { rx: /(^|_)(email|email_address)($|_)/i, label: "email" },
  { rx: /(^|_)(address|street|postal_?code|zip)($|_)/i, label: "address" },
  { rx: /(^|_)(dob|date_of_birth|birth_date)($|_)/i, label: "dob" },
  { rx: /(^|_)(government_id|passport|drivers_license)($|_)/i, label: "gov-id" },
];

export type ScanSeverity = "info" | "warn" | "critical";

export interface ScanFinding {
  kind: "anon_read" | "anon_read_pii";
  severity: ScanSeverity;
  table: string;
  matchedColumns: string[];
  message: string;
}

export interface ScanResult {
  ok: true;
  host: string;
  score: number;
  tablesDiscovered: number;
  tablesScanned: number;
  anonReadableCount: number;
  findings: ScanFinding[];
  durationMs: number;
}

export interface ScanError {
  ok: false;
  category: "bad_url" | "unauthorized" | "unreachable" | "empty";
  message: string;
}

/** Normalize + validate a project URL to a Supabase host base (no trailing slash). */
export function normalizeSupabaseUrl(raw: string): string | null {
  let base = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/^http:\/\//i, "https://");
  if (!SUPABASE_HOST_RE.test(base)) return null;
  return base;
}

interface OpenApiDoc {
  definitions?: Record<string, { properties?: Record<string, unknown> }>;
  paths?: Record<string, unknown>;
}

async function fetchWithTimeout(url: string, apiKey: string, accept: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}`, Accept: accept },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Discover tables + their columns from the PostgREST OpenAPI document. */
async function discoverTables(
  base: string,
  apiKey: string,
): Promise<{ tables: Array<{ name: string; columns: string[] }> } | ScanError> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base}/rest/v1/`, apiKey, "application/openapi+json", OPENAPI_TIMEOUT_MS);
  } catch {
    return { ok: false, category: "unreachable", message: "Couldn't reach the project's REST endpoint." };
  }
  if (res.status === 401) {
    return { ok: false, category: "unauthorized", message: "The anon key was rejected by the project." };
  }
  if (!res.ok) {
    return { ok: false, category: "unreachable", message: `The project responded with ${res.status}.` };
  }
  let doc: OpenApiDoc;
  try {
    doc = (await res.json()) as OpenApiDoc;
  } catch {
    return { ok: false, category: "unreachable", message: "The project didn't return a readable schema." };
  }
  const defs = doc.definitions ?? {};
  const tables = Object.entries(defs)
    .map(([name, def]) => ({ name, columns: Object.keys(def.properties ?? {}) }))
    // PostgREST also lists RPCs under paths, not definitions; definitions are tables/views.
    .filter((t) => t.name && !t.name.startsWith("(") );
  if (tables.length === 0) {
    return { ok: false, category: "empty", message: "No tables are exposed on the project's REST API." };
  }
  return { tables };
}

/** Probe one table for anon readability. */
async function probeAnonRead(base: string, apiKey: string, table: string): Promise<boolean> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${base}/rest/v1/${encodeURIComponent(table)}?limit=${PROBE_LIMIT}`,
      apiKey,
      "application/json",
      PROBE_TIMEOUT_MS,
    );
  } catch {
    return false;
  }
  if (res.status === 401 || res.status === 403 || !res.ok) return false;
  try {
    const j = (await res.json()) as unknown;
    return Array.isArray(j) && j.length > 0;
  } catch {
    return false;
  }
}

function piiColumns(columns: string[]): string[] {
  const hits: string[] = [];
  for (const col of columns) {
    for (const p of PII_PATTERNS) {
      if (p.rx.test(col)) {
        hits.push(col);
        break;
      }
    }
  }
  return hits;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Run the full stateless scan. Returns findings + a 0–100 security score.
 * `now` is injected so the caller controls timing (and tests are deterministic).
 */
export async function scanProjectAnon(
  rawUrl: string,
  anonKey: string,
  now: () => number = Date.now,
): Promise<ScanResult | ScanError> {
  const base = normalizeSupabaseUrl(rawUrl);
  if (!base) {
    return {
      ok: false,
      category: "bad_url",
      message: "Enter a hosted Supabase URL like https://abcd.supabase.co.",
    };
  }
  const host = base.replace(/^https:\/\//, "");
  const t0 = now();

  const discovered = await discoverTables(base, anonKey);
  if ("ok" in discovered && discovered.ok === false) return discovered;
  const allTables = (discovered as { tables: Array<{ name: string; columns: string[] }> }).tables;
  const tables = allTables.slice(0, MAX_TABLES_PER_SCAN);

  const readable = await mapWithConcurrency(tables, PROBE_CONCURRENCY, async (t) => ({
    table: t,
    anonReadable: await probeAnonRead(base, anonKey, t.name),
  }));

  const findings: ScanFinding[] = [];
  for (const r of readable) {
    if (!r.anonReadable) continue;
    const pii = piiColumns(r.table.columns);
    if (pii.length > 0) {
      findings.push({
        kind: "anon_read_pii",
        severity: "critical",
        table: r.table.name,
        matchedColumns: pii,
        message: `Anyone can read "${r.table.name}" without signing in — and it exposes sensitive columns (${pii.join(", ")}).`,
      });
    } else {
      findings.push({
        kind: "anon_read",
        severity: "warn",
        table: r.table.name,
        matchedColumns: [],
        message: `"${r.table.name}" is readable by anonymous visitors. Confirm that's intended; otherwise add an RLS policy.`,
      });
    }
  }

  const critical = findings.filter((f) => f.severity === "critical").length;
  const warn = findings.filter((f) => f.severity === "warn").length;
  const score = Math.max(0, 100 - critical * 20 - warn * 8);

  return {
    ok: true,
    host,
    score,
    tablesDiscovered: allTables.length,
    tablesScanned: tables.length,
    anonReadableCount: readable.filter((r) => r.anonReadable).length,
    findings,
    durationMs: now() - t0,
  };
}
