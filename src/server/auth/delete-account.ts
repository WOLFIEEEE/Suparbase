import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { log } from "@/server/log";

/**
 * Self-service account deletion. Because almost every domain table
 * has `ON DELETE CASCADE` on its `user_id` FK, deleting the users
 * row removes:
 *   - connections, connection_member, connection_invitation
 *   - audit_log (FK is set-null, so rows stay for tenant integrity)
 *   - billing_event (set-null)
 *   - subscription (cascade)
 *   - agent_session, sentry_finding, sentry_scan (cascade)
 *   - schema_analysis, dashboard_widget, custom_action,
 *     saved_views, user_settings (cascade)
 *   - admin_action target/admin (set-null)
 *
 * Result: nothing tying back to the deleted user remains except
 * historical audit rows with null user_id (intentional — operator
 * forensics keep value).
 *
 * Compliance: this fulfils GDPR Art. 17 ("right to be forgotten")
 * for the customer's own data. Sub-processors (Dodo, Resend) handle
 * deletion through their own policies on next sync.
 */
export async function deleteUserAccount(userId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    // Drizzle delete on the users row; cascades handle the rest.
    const removed = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    if (removed.length === 0) {
      return { ok: false, reason: "User not found." };
    }
    log.info("self-delete account", { userId });
    return { ok: true };
  } catch (e) {
    log.error("self-delete account failed", { userId, err: (e as Error).message });
    return { ok: false, reason: "Delete failed. Email contact@suparbase.com." };
  }
}
