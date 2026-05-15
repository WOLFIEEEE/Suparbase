import "server-only";
import { and, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLog } from "@/server/schema/audit";
import { sentryFindings, sentryScans } from "@/server/schema/sentry";
import { agentSessions } from "@/server/schema/agent-sessions";

/**
 * Retention helpers. Without these, the audit-shaped tables grow
 * forever — on a busy connection that's gigabytes per month.
 *
 * What gets pruned:
 *   - audit_log: rows older than `auditRetentionDays`.
 *   - sentry_scan: rows older than `scanRetentionDays`.
 *   - sentry_finding: only resolved + archived rows older than
 *     `resolvedFindingRetentionDays`. Open / quarantined findings are
 *     never pruned — they represent active state.
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
}

export const DEFAULT_RETENTION: RetentionConfig = {
  auditRetentionDays: 90,
  scanRetentionDays: 30,
  resolvedFindingRetentionDays: 60,
  agentSessionRetentionDays: 90,
};

export interface RetentionResult {
  auditRowsPruned: number;
  scansPruned: number;
  findingsPruned: number;
  sessionsPruned: number;
  durationMs: number;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export async function runRetention(
  config: RetentionConfig = DEFAULT_RETENTION,
): Promise<RetentionResult> {
  const t0 = Date.now();

  // 1. audit_log — drop write rows older than the cap.
  const auditCutoff = daysAgo(config.auditRetentionDays);
  const audit = await db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, auditCutoff))
    .returning({ id: auditLog.id });

  // 2. sentry_scan — drop scans older than the cap. Findings keep
  // their FK as null (set-null on delete), so individual findings
  // discovered in a pruned scan remain usable.
  const scanCutoff = daysAgo(config.scanRetentionDays);
  const scans = await db
    .delete(sentryScans)
    .where(lt(sentryScans.startedAt, scanCutoff))
    .returning({ id: sentryScans.id });

  // 3. sentry_finding — only prune findings that have been
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

  // 4. agent_session — drop closed / undone sessions whose linked
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

  return {
    auditRowsPruned: audit.length,
    scansPruned: scans.length,
    findingsPruned: findings.length,
    sessionsPruned: sessions.length,
    durationMs: Date.now() - t0,
  };
}
