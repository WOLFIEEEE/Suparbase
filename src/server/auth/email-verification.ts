import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users, verificationTokens } from "@/server/schema";

/**
 * Email verification flow. Reuses NextAuth's `verificationTokens`
 * table (which is otherwise unused — we don't ship the email
 * magic-link provider) and namespaces the identifier so a future
 * magic-link rollout won't collide.
 *
 *   identifier  : "email-verify:<lowercased-email>"
 *   token       : SHA-256(<plaintext>)
 *   expires     : now + 24h
 *
 * The plaintext token is sent to the user in the verification link;
 * only the hash is persisted. Consumption is single-use and clears
 * every outstanding verification row for the email.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const IDENTIFIER_PREFIX = "email-verify:";

export function hashVerifyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a verification token for the user. Returns null when the
 * email isn't tied to a user (don't leak that information to
 * unauth'd callers; the caller's HTTP shape can stay enumeration-
 * resistant by returning 200 either way).
 */
export async function issueVerifyToken(
  email: string,
): Promise<{ token: string; userEmail: string; expiresAt: Date } | null> {
  const lower = email.trim().toLowerCase();
  if (!lower.includes("@")) return null;

  const userRows = await db
    .select({ email: users.email, verified: users.emailVerified })
    .from(users)
    .where(sql`lower(${users.email}) = ${lower}`)
    .limit(1);
  const user = userRows[0];
  if (!user?.email) return null;
  // No-op if already verified — caller shows a "you're already
  // verified" message instead of issuing a useless token.
  if (user.verified) {
    return { token: "", userEmail: user.email, expiresAt: new Date(0) };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashVerifyToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Clear any prior in-flight tokens for this identifier — only the
  // most recent link should work.
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, `${IDENTIFIER_PREFIX}${lower}`));

  await db.insert(verificationTokens).values({
    identifier: `${IDENTIFIER_PREFIX}${lower}`,
    token: tokenHash,
    expires: expiresAt,
  });

  return { token, userEmail: user.email, expiresAt };
}

export type ConfirmResult =
  | { ok: true; email: string }
  | { ok: false; reason: "not_found" | "expired" | "already_verified" };

/**
 * Consume a verification token: looks up by hash, checks expiry,
 * stamps `users.email_verified`, deletes every other in-flight
 * token for the same identifier.
 */
export async function confirmVerifyToken(token: string): Promise<ConfirmResult> {
  if (!token) return { ok: false, reason: "not_found" };
  const tokenHash = hashVerifyToken(token);

  const rows = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row || !row.identifier.startsWith(IDENTIFIER_PREFIX)) {
    return { ok: false, reason: "not_found" };
  }
  if (row.expires.getTime() <= Date.now()) {
    // Clean up the stale row.
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, tokenHash));
    return { ok: false, reason: "expired" };
  }
  const lower = row.identifier.slice(IDENTIFIER_PREFIX.length);

  // Find the user (verify the identifier still corresponds to a
  // real account; the user might have deleted their account).
  const userRows = await db
    .select({ email: users.email, verified: users.emailVerified })
    .from(users)
    .where(sql`lower(${users.email}) = ${lower}`)
    .limit(1);
  const user = userRows[0];
  if (!user?.email) {
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, tokenHash));
    return { ok: false, reason: "not_found" };
  }
  if (user.verified) {
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, tokenHash));
    return { ok: false, reason: "already_verified" };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ emailVerified: new Date() })
      .where(sql`lower(${users.email}) = ${lower}`);
    // Drop every verification row for this identifier — the user
    // is verified now, future tokens would be no-ops.
    await tx
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, `${IDENTIFIER_PREFIX}${lower}`));
  });

  return { ok: true, email: user.email };
}

/** Active (unexpired) tokens for an email — used as a rate cap. */
export async function activeVerifyTokenCount(email: string): Promise<number> {
  const lower = email.trim().toLowerCase();
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, `${IDENTIFIER_PREFIX}${lower}`),
        gt(verificationTokens.expires, new Date()),
      ),
    );
  return rows[0]?.c ?? 0;
}
