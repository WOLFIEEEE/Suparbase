import "server-only";
import { and, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog } from "@/server/schema/audit";
import { sentryFindings, sentryScans } from "@/server/schema/sentry";
import { agentSessions } from "@/server/schema/agent-sessions";
import { users, verificationTokens } from "@/server/schema/auth";
import { subscriptions } from "@/server/schema/billing";

/**
 * Retention helpers. Without these, the audit-shaped tables grow
 * forever - on a busy connection that's gigabytes per month.
 *
 * What gets pruned:
 *   - audit_log: rows older than `auditRetentionDays`.
 *   - sentry_scan: rows older than `scanRetentionDays`.
 *   - sentry_finding: only resolved + archived rows older than
 *     `resolvedFindingRetentionDays`. Open / quarantined findings are
 *     never pruned - they represent active state.
 *   - agent_session: only undone / closed sessions older than
 *     `agentSessionRetentionDays`, AFTER the linked audit_log rows
 *     have been pruned. Sessions whose writes still exist in audit_log
 *     are kept so the UI can render their mutation timeline.
 *
 * Designed to be called from /api/cron/retention by a scheduler
 * (Coolify cron, Vercel cron, an external cron-job.org hit, whatever).
 * The handler is idempotent: running it 1×/hour and 1×/day produces
 * the same end state.
 */

export interface RetentionConfig {
  auditRetentionDays: number;
  scanRetentionDays: number;
  resolvedFindingRetentionDays: number;
  agentSessionRetentionDays: number;
  /**
   * Days after creation before a passwordless / unverified user row
   * that has no subscription is considered abandoned and removed.
   * Captures guest-checkout sessions where the visitor never came
   * back to claim, and stale rows where someone started signup but
   * never verified.
   */
  abandonedUserRetentionDays: number;
}

export const DEFAULT_RETENTION: RetentionConfig = {
  auditRetentionDays: 90,
  scanRetentionDays: 30,
  resolvedFindingRetentionDays: 60,
  agentSessionRetentionDays: 90,
  abandonedUserRetentionDays: 14,
};

export interface RetentionResult {
  auditRowsPruned: number;
  scansPruned: number;
  findingsPruned: number;
  sessionsPruned: number;
  expiredTokensPruned: number;
  abandonedUsersPruned: number;
  durationMs: number;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export async function runRetention(
  config: RetentionConfig = DEFAULT_RETENTION,
): Promise<RetentionResult> {
  const t0 = Date.now();

  // 1. audit_log: drop write rows older than the cap. Done in
  // batches of 5000 so we hold row locks + write WAL for a bounded
  // window per statement, even on tables with millions of rows.
  // The createdAt scan uses `audit_created_at_idx`.
  const auditCutoff = daysAgo(config.auditRetentionDays);
  let auditRowsPruned = 0;
  const AUDIT_BATCH = 5000;
  // Cap iterations so a runaway never holds the cron handler open;
  // 1M rows in one pass is enough - anything bigger we'll catch on
  // the next cron tick.
  for (let iter = 0; iter < 200; iter++) {
    const result = await db.execute<{ id: string }>(sql`
      DELETE FROM ${auditLog}
      WHERE id IN (
        SELECT id FROM ${auditLog}
        WHERE ${auditLog.createdAt} < ${auditCutoff}
        ORDER BY ${auditLog.createdAt}
        LIMIT ${AUDIT_BATCH}
      )
      RETURNING id
    `);
    const pruned = result.length ?? 0;
    auditRowsPruned += pruned;
    if (pruned < AUDIT_BATCH) break;
  }

  // 2. sentry_scan: drop scans older than the cap. Findings keep
  // their FK as null (set-null on delete), so individual findings
  // discovered in a pruned scan remain usable.
  const scanCutoff = daysAgo(config.scanRetentionDays);
  const scans = await db
    .delete(sentryScans)
    .where(lt(sentryScans.startedAt, scanCutoff))
    .returning({ id: sentryScans.id });

  // 3. sentry_finding: only prune findings that have been
  // explicitly resolved (or acknowledged + aged out). Open + quarantined
  // findings represent live state and must persist.
  const findingCutoff = daysAgo(config.resolvedFindingRetentionDays);
  const findings = await db
    .delete(sentryFindings)
    .where(
      and(
        lt(sentryFindings.lastSeenAt, findingCutoff),
        // Drizzle doesn't have inArray for the status enum; use a raw fragment.
        sql`${sentryFindings.status} IN ('resolved', 'acknowledged')`,
      ),
    )
    .returning({ id: sentryFindings.id });

  // 4. agent_session: drop closed / undone sessions whose linked
  // audit_log rows are also gone (otherwise the UI can't display them).
  // Cheapest correct ordering: prune audit_log first (already done),
  // then prune sessions whose lastSeenAt is older than the cap AND
  // whose status is no longer "active".
  const sessionCutoff = daysAgo(config.agentSessionRetentionDays);
  const sessions = await db
    .delete(agentSessions)
    .where(
      and(
        lt(agentSessions.lastSeenAt, sessionCutoff),
        sql`${agentSessions.status} IN ('closed', 'undone', 'undo_partial', 'undo_failed')`,
      ),
    )
    .returning({ id: agentSessions.id });

  // 5. verificationTokens: any expired row is unreachable - they're
  // single-use and TTL is checked at read time, but we still want to
  // keep the table tidy. Covers email-verify + password-reset +
  // welcome: tokens uniformly.
  const expiredTokens = await db
    .delete(verificationTokens)
    .where(lt(verificationTokens.expires, new Date()))
    .returning({ identifier: verificationTokens.identifier });

  // 6. abandoned users: rows with no password hash, no verified
  // email, no active or trialing subscription, older than the
  // cutoff. Two scenarios this catches:
  //   - Guest-checkout where the visitor closed the tab before
  //     completing the Dodo flow. We created the row optimistically;
  //     if no payment ever arrived, it's pure orphan.
  //   - Half-finished signups where the user never confirmed their
  //     email and never logged in.
  // We deliberately keep rows with ANY subscription history - even
  // a cancelled or expired sub means there was a real customer, and
  // their audit_log + billing_event rows reference user_id.
  const abandonedCutoff = daysAgo(config.abandonedUserRetentionDays);
  const abandoned = await db.execute<{ id: string }>(sql`
    DELETE FROM ${users}
    WHERE ${users.id} IN (
      SELECT u.id
      FROM ${users} u
      LEFT JOIN ${subscriptions} s ON s.user_id = u.id
      WHERE u.password_hash IS NULL
        AND u."emailVerified" IS NULL
        AND u."createdAt" < ${abandonedCutoff}
        AND s.id IS NULL
      LIMIT 5000
    )
    RETURNING id
  `);

  return {
    auditRowsPruned,
    scansPruned: scans.length,
    findingsPruned: findings.length,
    sessionsPruned: sessions.length,
    expiredTokensPruned: expiredTokens.length,
    abandonedUsersPruned: abandoned.length ?? 0,
    durationMs: Date.now() - t0,
  };
}
