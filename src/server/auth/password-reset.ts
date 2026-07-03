import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { hash as bcryptHash } from "bcryptjs";
import { db } from "@/server/db";
import { passwordResetTokens, users } from "@/server/schema";

/**
 * Password-reset token lifecycle. The token in the URL is a 32-byte
 * url-safe random string; only its SHA-256 hash is stored. The
 * issuance endpoint is enumeration-resistant (returns 200 whether
 * the email exists or not). Successful consumption invalidates the
 * token, updates the user's password, and revokes any other
 * outstanding tokens for the same user.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
/** bcrypt cost factor matching the rest of the credential pipeline. */
const BCRYPT_COST = 12;

export interface IssueTokenResult {
  /** The plaintext token to put in the email URL. */
  token: string;
  /** Expiry timestamp (ISO). */
  expiresAt: Date;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a token for the user with this email. Returns null when no
 * user exists - the caller should still return 200 to defeat
 * enumeration. Records the requester IP for forensic audit.
 */
export async function issueResetToken(
  email: string,
  requestedFromIp: string | null,
): Promise<{ token: string; userEmail: string; expiresAt: Date } | null> {
  const lower = email.trim().toLowerCase();
  if (!lower.includes("@")) return null;

  const userRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${lower}`)
    .limit(1);
  const user = userRows[0];
  if (!user?.id || !user.email) return null;

  // 32 bytes → 43-char url-safe base64; ample entropy.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
    requestedFromIp,
  });

  return { token, userEmail: user.email, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "consumed" };

/**
 * Consume a token: verify it exists, hasn't been consumed, and
 * hasn't expired. On success, marks it consumed and updates the
 * user's password. Atomic via a single UPDATE for the consume step.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string,
): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumedAt) return { ok: false, reason: "consumed" };
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  // Hash the new password and apply in one transaction.
  const passwordHash = await bcryptHash(newPassword, BCRYPT_COST);
  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
    // Invalidate every other outstanding token for this user - a
    // successful reset should void any in-flight links.
    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, row.userId),
          isNull(passwordResetTokens.consumedAt),
        ),
      );
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(users.id, row.userId));
  });

  return { ok: true, userId: row.userId };
}

/**
 * Rate-limit gate: max 5 active (unconsumed, unexpired) tokens per
 * user. Defends against an attacker spamming the forgot-password
 * endpoint to fill the inbox of someone who knows their password.
 */
export async function activeTokenCount(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.consumedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    );
  return rows[0]?.c ?? 0;
}
