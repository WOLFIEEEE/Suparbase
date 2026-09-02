import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { decryptKey } from "@/server/crypto/vault";
import { connections, type ConnectionRow } from "@/server/schema/connections";
import {
  sentryFindings,
  sentryScans,
  type FindingDetails,
  type FindingKind,
  type FindingSeverity,
  type SentryScanRow,
} from "@/server/schema/sentry";
import { executeSql } from "@/server/proxy/sql-playground";
import { introspectConnection } from "@/server/schema-introspect";
import { sendSentryAlert } from "./alert";
import { notifyConnection } from "@/server/notifications/repo";

/**
 * Sentry probe, the security watchdog.
 *
 * Two channels:
 *   1. **Anon REST probe**, fires unauthenticated GETs at the project's
 *      PostgREST endpoint for every table in `public`. If a table
 *      responds 200 with rows (or even an empty array), that table is
 *      anon-readable. This catches the Moltbook / Lovable CVE pattern.
 *   2. **pg_policies inspection**, when the connection has a direct
 *      Postgres URL, we read pg_policies + pg_class to identify tables
 *      where rls is *disabled* outright, or tables with no policies at
 *      all (the default-permissive trap).
 *
 * For every anon-readable table, we then run a column heuristic: if any
 * column name matches a PII pattern (email/password/token/secret/...),
 * we escalate the finding to `critical`.
 */

const ANON_PROBE_LIMIT = 3;
const ANON_PROBE_TIMEOUT_MS = 8_000;

/** Column-name patterns that should never be anon-readable. Conservative. */
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

interface CollectedFinding {
  kind: FindingKind;
  severity: FindingSeverity;
  schemaName: string | null;
  tableName: string | null;
  columnName: string | null;
  details: FindingDetails;
}

export interface ScanResult {
  scanId: string;
  findings: number;
  tablesScanned: string[];
  durationMs: number;
}

export async function runSentryScan(
  userId: string,
  conn: ConnectionRow,
): Promise<ScanResult> {
  const startedAt = new Date();
  const [scanRow] = await db
    .insert(sentryScans)
    .values({
      userId,
      connectionId: conn.id,
      startedAt,
    })
    .returning();

  const findings: CollectedFinding[] = [];
  const tablesScanned: string[] = [];
  let scanError: string | null = null;

  try {
    const schema = await introspectConnection(conn);
    const userTables = schema.tables.filter(
      (t) =>
        t.kind === "table" &&
        t.schema === "public" &&
        !t.name.startsWith("_"),
    );

    // ── 1. pg_policies inspection (only when direct PG is wired) ──
    const policyMap = await readPolicyMap(conn).catch((e) => {
      // Not fatal, the probe still runs, we just lose the policy view.
      findings.push({
        kind: "scan_error",
        severity: "info",
        schemaName: null,
        tableName: null,
        columnName: null,
        details: {
          message: `pg_policies inspection skipped: ${(e as Error).message}`,
        },
      });
      return null;
    });

    // ── 2. Anon REST probe per public table ──
    //
    // CRITICAL: if the connection's stored key is `service_role`, that key
    // bypasses RLS server-side, so probing with it would report every
    // table as anon-readable, pure noise. Skip the REST channel entirely
    // and surface an explanatory finding. The pg_policies channel above
    // still runs and produces real findings.
    const skipAnonProbe = conn.role === "service_role";
    if (skipAnonProbe) {
      findings.push({
        kind: "scan_error",
        severity: "info",
        schemaName: null,
        tableName: null,
        columnName: null,
        details: {
          message:
            "Anon-probe skipped: stored key is service_role, which bypasses RLS. Replace it with an anon key on the connection settings page to enable the anonymous-readability probe.",
        },
      });
    }
    const apiKey = skipAnonProbe ? null : decryptKey(conn.encryptedKey);
    const baseUrl = `${conn.url}/rest/v1`;

    for (const t of userTables) {
      tablesScanned.push(`${t.schema}.${t.name}`);

      // Per-table pg_policies findings
      if (policyMap) {
        const p = policyMap.get(`${t.schema}.${t.name}`);
        if (p && p.rlsEnabled === false) {
          findings.push({
            kind: "rls_disabled",
            severity: "critical",
            schemaName: t.schema,
            tableName: t.name,
            columnName: null,
            details: {
              message:
                "Row-Level Security is disabled on this table. The anon key can read every row.",
            },
          });
        } else if (p && p.policies.length === 0) {
          findings.push({
            kind: "rls_disabled",
            severity: "warn",
            schemaName: t.schema,
            tableName: t.name,
            columnName: null,
            details: {
              message:
                "RLS is enabled but no policies exist. PostgREST will return empty results for anon, but any new permissive policy could leak the table.",
            },
          });
        }
        // Heuristic for "permissive for all": policy USING is just `true`.
        for (const pol of p?.policies ?? []) {
          if (/^\s*true\s*$/i.test(pol.qual ?? "")) {
            findings.push({
              kind: "policy_overly_permissive",
              severity: "warn",
              schemaName: t.schema,
              tableName: t.name,
              columnName: null,
              details: {
                policyName: pol.policyName,
                policyDefinition: pol.qual ?? undefined,
                message:
                  "Policy uses `USING (true)`, every authenticated user can read every row.",
              },
            });
          }
        }
      }

      // Anon REST probe, skipped entirely when the stored key is
      // service_role (it would bypass RLS and report every table as
      // anon-readable).
      if (!apiKey) continue;
      const probeResult = await probeAnonRead(baseUrl, apiKey, t.name);
      if (!probeResult.reachable) continue;
      if (probeResult.anonReadable) {
        // Identify any PII columns on this table.
        const pii: string[] = [];
        for (const col of t.columns) {
          for (const p of PII_PATTERNS) {
            if (p.rx.test(col.name)) {
              pii.push(col.name);
              break;
            }
          }
        }
        if (pii.length > 0) {
          findings.push({
            kind: "anon_read_pii",
            severity: "critical",
            schemaName: t.schema,
            tableName: t.name,
            columnName: null,
            details: {
              rowCount: probeResult.rowCount ?? undefined,
              matchedColumns: pii,
              message: `Table is anon-readable and contains PII-flavoured columns: ${pii.join(", ")}.`,
            },
          });
        } else {
          findings.push({
            kind: "anon_read",
            severity: "warn",
            schemaName: t.schema,
            tableName: t.name,
            columnName: null,
            details: {
              rowCount: probeResult.rowCount ?? undefined,
              message:
                "Table is anon-readable. Confirm this is intended; otherwise add an RLS policy.",
            },
          });
        }
      }
    }
  } catch (e) {
    scanError = (e as Error).message ?? "Scan failed.";
  }

  // Persist findings, dedup against open ones for the same (kind, schema, table).
  const newFindings = await persistFindings(userId, conn.id, scanRow.id, findings);

  // Alert webhook: only NEW criticals notify, so a re-scan of a known-bad
  // table doesn't ping the channel every time. Fire-and-forget.
  const newCritical = newFindings.filter((f) => f.severity === "critical");
  if (newCritical.length > 0) {
    // In-app inbox for everyone on the connection, webhook or not.
    void notifyConnection(conn.id, {
      kind: "sentry_critical",
      title: `${newCritical.length} new critical finding${newCritical.length === 1 ? "" : "s"} on ${conn.name}`,
      body: newCritical
        .slice(0, 5)
        .map((f) => `${f.kind} on ${f.schemaName ?? "?"}.${f.tableName ?? "?"}`)
        .join(" · "),
      href: `/c/${conn.id}/sentry`,
    });
  }
  if (newCritical.length > 0 && conn.alertWebhookUrl) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://suparbase.com";
    void sendSentryAlert(
      conn,
      siteUrl,
      newCritical.map((f) => ({
        kind: f.kind,
        severity: f.severity,
        schemaName: f.schemaName,
        tableName: f.tableName,
        columnName: f.columnName,
      })),
    );
  }

  const completedAt = new Date();
  await db
    .update(sentryScans)
    .set({
      completedAt,
      tablesScanned,
      findingsCount: String(findings.length),
      error: scanError,
    })
    .where(eq(sentryScans.id, scanRow.id));

  return {
    scanId: scanRow.id,
    findings: findings.length,
    tablesScanned,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Anon probe
// ---------------------------------------------------------------------------

interface AnonProbeResult {
  reachable: boolean;
  anonReadable: boolean;
  rowCount: number | null;
}

async function probeAnonRead(
  baseUrl: string,
  apiKey: string,
  table: string,
): Promise<AnonProbeResult> {
  const url = `${baseUrl}/${encodeURIComponent(table)}?limit=${ANON_PROBE_LIMIT}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANON_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      // IMPORTANT: we pass the anon (or whatever) apikey *intentionally* so
      // PostgREST recognises the JWT and applies RLS for anon. Without the
      // apikey the request 401s and tells us nothing.
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { reachable: true, anonReadable: false, rowCount: null };
    }
    if (!res.ok) {
      return { reachable: false, anonReadable: false, rowCount: null };
    }
    const text = await res.text();
    let rowCount = 0;
    try {
      const j = JSON.parse(text) as unknown;
      if (Array.isArray(j)) rowCount = j.length;
    } catch {
      /* not JSON */
    }
    // PostgREST returns 200 with [] when RLS evaluates but excludes every row.
    // That's the "RLS is silently rejecting you" case, anon is not actually
    // reading data, so we don't flag it. Only when rowCount > 0 do we flag.
    return {
      reachable: true,
      anonReadable: rowCount > 0,
      rowCount,
    };
  } catch {
    return { reachable: false, anonReadable: false, rowCount: null };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// pg_policies / pg_class inspection via direct PG
// ---------------------------------------------------------------------------

interface TablePolicies {
  rlsEnabled: boolean;
  policies: Array<{ policyName: string; cmd: string; roles: string; qual: string | null }>;
}

async function readPolicyMap(conn: ConnectionRow): Promise<Map<string, TablePolicies>> {
  if (!conn.encryptedPostgresUrl) {
    throw new Error("Direct Postgres URL not configured.");
  }
  const sql = `
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      COALESCE(
        json_agg(
          json_build_object(
            'policyname', p.polname,
            'cmd', CASE p.polcmd
              WHEN 'r' THEN 'SELECT'
              WHEN 'a' THEN 'INSERT'
              WHEN 'w' THEN 'UPDATE'
              WHEN 'd' THEN 'DELETE'
              ELSE '*'
            END,
            'roles', (SELECT string_agg(rolname, ',') FROM pg_roles WHERE oid = ANY(p.polroles)),
            'qual', pg_get_expr(p.polqual, p.polrelid)
          )
        ) FILTER (WHERE p.polname IS NOT NULL),
        '[]'::json
      ) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
    GROUP BY n.nspname, c.relname, c.relrowsecurity
  `;
  const result = await executeSql({
    conn,
    sql,
    readOnly: true,
    statementTimeoutMs: 8_000,
  });
  const map = new Map<string, TablePolicies>();
  for (const row of result.rows) {
    const schemaName = String(row[0]);
    const tableName = String(row[1]);
    const rlsEnabled = row[2] === true || row[2] === "t" || row[2] === "true";
    const rawPolicies = row[3];
    let policies: TablePolicies["policies"] = [];
    if (Array.isArray(rawPolicies)) {
      policies = (rawPolicies as Array<Record<string, unknown>>).map((p) => ({
        policyName: String(p.policyname ?? ""),
        cmd: String(p.cmd ?? ""),
        roles: String(p.roles ?? ""),
        qual: p.qual == null ? null : String(p.qual),
      }));
    } else if (typeof rawPolicies === "string") {
      try {
        const parsed = JSON.parse(rawPolicies) as Array<Record<string, unknown>>;
        policies = parsed.map((p) => ({
          policyName: String(p.policyname ?? ""),
          cmd: String(p.cmd ?? ""),
          roles: String(p.roles ?? ""),
          qual: p.qual == null ? null : String(p.qual),
        }));
      } catch {
        /* leave empty */
      }
    }
    map.set(`${schemaName}.${tableName}`, { rlsEnabled, policies });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Persist findings: upsert-by-table, refresh lastSeenAt, auto-resolve missing
// ---------------------------------------------------------------------------

async function persistFindings(
  userId: string,
  connectionId: string,
  scanId: string,
  found: CollectedFinding[],
): Promise<CollectedFinding[]> {
  // De-dupe by (kind, schema, table, column): a finding already open (or
  // acknowledged / quarantined) for the same condition gets its lastSeenAt,
  // severity, and details refreshed instead of a duplicate row. Resolved
  // findings are left alone — a re-detection is a genuinely new finding.
  // discoveredInScanId keeps pointing at the scan that first surfaced it.
  // Returns the findings that were NEW this scan (the alert-worthy ones).
  if (found.length === 0) return [];

  const existing = await db
    .select({
      id: sentryFindings.id,
      kind: sentryFindings.kind,
      schemaName: sentryFindings.schemaName,
      tableName: sentryFindings.tableName,
      columnName: sentryFindings.columnName,
    })
    .from(sentryFindings)
    .where(
      and(
        eq(sentryFindings.connectionId, connectionId),
        ne(sentryFindings.status, "resolved"),
      ),
    );

  const keyOf = (
    kind: string,
    schemaName: string | null,
    tableName: string | null,
    columnName: string | null,
  ) => `${kind}|${schemaName ?? ""}|${tableName ?? ""}|${columnName ?? ""}`;
  const openByKey = new Map(
    existing.map((r) => [keyOf(r.kind, r.schemaName, r.tableName, r.columnName), r.id]),
  );

  const now = new Date();
  const toInsert: CollectedFinding[] = [];
  for (const f of found) {
    const priorId = openByKey.get(
      keyOf(f.kind, f.schemaName ?? null, f.tableName ?? null, f.columnName ?? null),
    );
    if (priorId) {
      await db
        .update(sentryFindings)
        .set({ lastSeenAt: now, severity: f.severity, details: f.details })
        .where(eq(sentryFindings.id, priorId));
    } else {
      toInsert.push(f);
    }
  }

  if (toInsert.length === 0) return [];
  await db.insert(sentryFindings).values(
    toInsert.map((f) => ({
      userId,
      connectionId,
      discoveredInScanId: scanId,
      kind: f.kind,
      severity: f.severity,
      schemaName: f.schemaName,
      tableName: f.tableName,
      columnName: f.columnName,
      details: f.details,
    })),
  );
  return toInsert;
}

// ---------------------------------------------------------------------------
// Helpers used by the route layer
// ---------------------------------------------------------------------------

export async function loadConnectionById(connectionId: string): Promise<ConnectionRow | null> {
  const [row] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1);
  return row ?? null;
}

export function scanRowToSummary(row: SentryScanRow): {
  id: string;
  startedAt: string;
  completedAt: string | null;
  tablesScanned: string[];
  findingsCount: number;
  error: string | null;
} {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    tablesScanned: row.tablesScanned,
    findingsCount: Number.parseInt(row.findingsCount, 10) || 0,
    error: row.error,
  };
}
