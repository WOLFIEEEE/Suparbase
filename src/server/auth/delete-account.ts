import "server-only";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { log } from "@/server/log";

/**
 * Soft-delete account flow with a configurable grace period (default
 * 30 days). Three operations:
 *
 *   1. `scheduleAccountDeletion(userId)` - sets
 *      `users.deletion_scheduled_at` to `now() + graceDays`. The user
 *      stays signed in for the rest of the request, then is signed
 *      out by the caller. They can sign back in any time before the
 *      deadline to cancel.
 *
 *   2. `cancelScheduledDeletion(userId)` - clears the timestamp.
 *      Self-service; called from the account settings page banner.
 *
 *   3. `executeScheduledDeletions(graceCutoff?)` - hard-deletes every
 *      user whose `deletion_scheduled_at` is in the past. Called by
 *      the retention cron. Cascades remove every domain row that has
 *      `ON DELETE CASCADE` on `user_id`; audit_log uses set-null so
 *      historical rows survive with `user_id = NULL` for operator
 *      forensics (no personal data attached, per Art. 17).
 *
 * Auth callbacks should also refuse sign-in when the deletion
 * deadline has already passed - see `src/server/auth.ts`. Up to the
 * deadline, sign-in is allowed so the user can cancel.
 *
 * Compliance: this fulfils GDPR Art. 17 ("right to be forgotten") for
 * the customer's own data. The grace period is documented in the
 * privacy policy.
 */

const DEFAULT_GRACE_DAYS = 30;

export interface ScheduleDeletionResult {
  ok: boolean;
  scheduledFor?: Date;
  reason?: string;
}

export async function scheduleAccountDeletion(
  userId: string,
  graceDays: number = DEFAULT_GRACE_DAYS,
): Promise<ScheduleDeletionResult> {
  try {
    const scheduledFor = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
    const updated = await db
      .update(users)
      .set({ deletionScheduledAt: scheduledFor })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (updated.length === 0) {
      return { ok: false, reason: "User not found." };
    }
    log.info("scheduled account deletion", {
      userId,
      scheduledFor: scheduledFor.toISOString(),
    });
    return { ok: true, scheduledFor };
  } catch (e) {
    log.error("schedule deletion failed", {
      userId,
      err: (e as Error).message,
    });
    return { ok: false, reason: "Could not schedule deletion." };
  }
}

export async function cancelScheduledDeletion(
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const updated = await db
      .update(users)
      .set({ deletionScheduledAt: null })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (updated.length === 0) {
      return { ok: false, reason: "User not found." };
    }
    log.info("cancelled account deletion", { userId });
    return { ok: true };
  } catch (e) {
    log.error("cancel deletion failed", { userId, err: (e as Error).message });
    return { ok: false, reason: "Could not cancel deletion." };
  }
}

export interface DeletionStatus {
  scheduled: boolean;
  scheduledFor: Date | null;
  /** True when the grace period is past and the next cron tick will hard-delete. */
  pastGrace: boolean;
}

export async function getDeletionStatus(userId: string): Promise<DeletionStatus> {
  const rows = await db
    .select({ deletionScheduledAt: users.deletionScheduledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const t = rows[0]?.deletionScheduledAt ?? null;
  return {
    scheduled: t !== null,
    scheduledFor: t,
    pastGrace: t !== null && t.getTime() <= Date.now(),
  };
}

/**
 * Hard-delete every user whose grace period has expired. Called by
 * the retention cron. Cascade rules in the schema do the rest:
 *
 *   - connections, connection_member, invitation, subscription,
 *     agent_session, sentry_*, schema_analysis, dashboard_widget,
 *     custom_action, saved_views, user_settings → cascade
 *   - audit_log, billing_event, admin_action → set-null (forensics)
 *
 * Returns the number of rows deleted.
 */
export async function executeScheduledDeletions(): Promise<number> {
  try {
    const result = await db
      .delete(users)
      .where(
        and(
          isNotNull(users.deletionScheduledAt),
          lt(users.deletionScheduledAt, new Date()),
        ),
      )
      .returning({ id: users.id });
    if (result.length > 0) {
      log.info("executed scheduled deletions", { count: result.length });
    }
    return result.length;
  } catch (e) {
    log.error("execute scheduled deletions failed", {
      err: (e as Error).message,
    });
    return 0;
  }
}

// Backwards-compatible export for any external caller still using the
// old hard-delete entry point. Now schedules instead of deleting; the
// signed-out experience is the same.
export const deleteUserAccount = scheduleAccountDeletion;
