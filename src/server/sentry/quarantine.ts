import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import type { ConnectionRow } from "@/server/schema/connections";
import { sentryFindings } from "@/server/schema/sentry";
import { executeSql } from "@/server/proxy/sql-playground";
import { AppError } from "@/lib/errors";

/**
 * Apply a temporary "deny everything to anon" RLS policy to the table
 * referenced by a finding. We:
 *   1. ENABLE row-level security on the table (if it's off).
 *   2. CREATE POLICY <generated-name> ON <table> FOR ALL TO anon, authenticated USING (false).
 *   3. Mark the finding `quarantined` and remember the policy name so we
 *      can drop it later.
 *
 * Quarantine is reversible: dismissQuarantine() drops the policy and
 * marks the finding `acknowledged`.
 *
 * Requires the connection to have a direct Postgres URL configured.
 */

function policyName(findingId: string): string {
  // Full 36-char UUID (hyphens → underscores) so the name is globally
  // unique. Postgres identifiers go up to 63 bytes; "suparbase_sentry_"
  // is 17 bytes + 36 hex/underscore chars = 53 bytes, well under cap.
  // Prefixed so users can spot Sentry-managed policies in their schema.
  const safe = findingId.replace(/-/g, "_");
  return `suparbase_sentry_${safe}`;
}

function qualifiedIdent(schemaName: string, tableName: string): string {
  // Quote identifiers so unusual names don't break the policy SQL. Inputs
  // come from introspection — we never echo user-supplied table names.
  return `"${schemaName.replace(/"/g, '""')}"."${tableName.replace(/"/g, '""')}"`;
}

export async function quarantineFinding(
  userId: string,
  conn: ConnectionRow,
  findingId: string,
): Promise<void> {
  if (!conn.encryptedPostgresUrl) {
    throw new AppError("no_postgres_url", "Quarantine needs the direct Postgres URL.");
  }

  const [finding] = await db
    .select()
    .from(sentryFindings)
    .where(
      and(
        eq(sentryFindings.id, findingId),
        eq(sentryFindings.userId, userId),
        eq(sentryFindings.connectionId, conn.id),
      ),
    )
    .limit(1);
  if (!finding) throw new AppError("not_found", "Finding not found.");
  if (finding.status === "quarantined") {
    throw new AppError("validation", "This finding is already quarantined.");
  }
  if (!finding.schemaName || !finding.tableName) {
    throw new AppError("validation", "This finding isn't scoped to a single table.");
  }

  const ident = qualifiedIdent(finding.schemaName, finding.tableName);
  const pName = policyName(finding.id);

  // The execution order is important:
  //   1. ALTER TABLE … ENABLE RLS (no-op if already enabled)
  //   2. DROP POLICY IF EXISTS (defensive — should never be present)
  //   3. CREATE POLICY … USING (false)
  // Wrapped in a single SQL string so it runs inside one transaction.
  const sql = [
    `ALTER TABLE ${ident} ENABLE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS ${pName} ON ${ident};`,
    `CREATE POLICY ${pName} ON ${ident} AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false);`,
  ].join("\n");

  await executeSql({
    conn,
    sql,
    readOnly: false,
    statementTimeoutMs: 8_000,
  });

  await db
    .update(sentryFindings)
    .set({
      status: "quarantined",
      lastSeenAt: new Date(),
      quarantinePolicyName: pName,
    })
    .where(eq(sentryFindings.id, finding.id));
}

export async function dismissQuarantine(
  userId: string,
  conn: ConnectionRow,
  findingId: string,
): Promise<void> {
  if (!conn.encryptedPostgresUrl) {
    throw new AppError("no_postgres_url", "Dismiss needs the direct Postgres URL.");
  }
  const [finding] = await db
    .select()
    .from(sentryFindings)
    .where(
      and(
        eq(sentryFindings.id, findingId),
        eq(sentryFindings.userId, userId),
        eq(sentryFindings.connectionId, conn.id),
      ),
    )
    .limit(1);
  if (!finding) throw new AppError("not_found", "Finding not found.");
  if (finding.status !== "quarantined") {
    throw new AppError("validation", "This finding isn't quarantined.");
  }
  if (!finding.schemaName || !finding.tableName || !finding.quarantinePolicyName) {
    throw new AppError("validation", "Missing quarantine context.");
  }
  const ident = qualifiedIdent(finding.schemaName, finding.tableName);
  await executeSql({
    conn,
    sql: `DROP POLICY IF EXISTS ${finding.quarantinePolicyName} ON ${ident};`,
    readOnly: false,
    statementTimeoutMs: 6_000,
  });
  await db
    .update(sentryFindings)
    .set({
      status: "acknowledged",
      lastSeenAt: new Date(),
      quarantinePolicyName: null,
    })
    .where(eq(sentryFindings.id, finding.id));
}
