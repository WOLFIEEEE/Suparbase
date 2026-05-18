import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { log } from "@/server/log";

/**
 * Email suppression list. We mark a user row when Resend reports a
 * hard bounce or a spam complaint; `sendEmail()` consults this list
 * before every send.
 *
 * Why this matters:
 *   - Hard bounces signal "no inbox here" - retrying wastes the
 *     Resend quota and hurts our domain reputation.
 *   - Spam complaints are a deliverability red flag; if we keep
 *     sending to an address that flagged us, Gmail / Outlook
 *     downgrade our sender score across all customers.
 *
 * The flag is per-user, not global; if Alice's address starts
 * bouncing, Bob isn't affected. Operators can clear the flag from
 * the admin panel (todo: surface the toggle there) or directly in
 * SQL after the address is corrected.
 */

export type SuppressionReason =
  | "hard_bounce"
  | "soft_bounce_repeated"
  | "spam_complaint"
  | "manual";

export async function suppressEmail(
  recipient: string,
  reason: SuppressionReason,
): Promise<{ matched: number }> {
  const normalised = recipient.trim().toLowerCase();
  if (!normalised.includes("@")) return { matched: 0 };
  try {
    const updated = await db
      .update(users)
      .set({
        emailUndeliverableAt: new Date(),
        emailUndeliverableReason: reason,
      })
      .where(sql`lower(${users.email}) = ${normalised}`)
      .returning({ id: users.id });
    if (updated.length > 0) {
      log.warn("email suppressed", {
        recipient: normalised,
        reason,
        count: updated.length,
      });
    }
    return { matched: updated.length };
  } catch (e) {
    log.error("suppress email failed", {
      recipient: normalised,
      err: (e as Error).message,
    });
    return { matched: 0 };
  }
}

/** Returns true when this address has a non-null `email_undeliverable_at`. */
export async function isEmailSuppressed(recipient: string): Promise<boolean> {
  const normalised = recipient.trim().toLowerCase();
  if (!normalised.includes("@")) return false;
  const rows = await db
    .select({ flag: users.emailUndeliverableAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalised}`)
    .limit(1);
  return rows[0]?.flag != null;
}

/** Admin / operator helper - clear the suppression flag. */
export async function unsuppressEmail(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ emailUndeliverableAt: null, emailUndeliverableReason: null })
    .where(eq(users.id, userId));
  log.info("email suppression cleared", { userId });
}
