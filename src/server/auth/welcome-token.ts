import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users, verificationTokens } from "@/server/schema";

/**
 * Welcome flow for guest checkout. After a visitor completes a Dodo
 * checkout without first having an account, we mint a single-use
 * welcome token they redeem at `/welcome/<token>` to set a password
 * and sign in.
 *
 * The token is stored hashed in `verificationTokens` (NextAuth's
 * existing table, also used by email-verify and password-reset).
 * The identifier namespace prevents collisions with those flows.
 *
 *   identifier  : "welcome:<userId>"
 *   token       : SHA-256(<plaintext>)
 *   expires     : now + 7d
 *
 * 7 days is generous on purpose - someone who paid and didn't claim
 * their account immediately deserves a long window to find the email
 * we sent them. Forgot-password is the fallback after that.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IDENTIFIER_PREFIX = "welcome:";

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueWelcomeToken(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const plaintext = randomBytes(32).toString("base64url");
  const tokenHash = hash(plaintext);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Clear any prior welcome tokens for this user - only the most
  // recent invitation should work.
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, `${IDENTIFIER_PREFIX}${userId}`));

  await db.insert(verificationTokens).values({
    identifier: `${IDENTIFIER_PREFIX}${userId}`,
    token: tokenHash,
    expires: expiresAt,
  });

  return { token: plaintext, expiresAt };
}

export type WelcomePeek =
  | { ok: true; userId: string; email: string; alreadyClaimed: boolean }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Look up a welcome token without consuming it. Used by the welcome
 * page to render either the set-password form or an error before
 * the user submits.
 */
export async function peekWelcomeToken(token: string): Promise<WelcomePeek> {
  if (!token) return { ok: false, reason: "not_found" };
  const tokenHash = hash(token);

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
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, tokenHash));
    return { ok: false, reason: "expired" };
  }
  const userId = row.identifier.slice(IDENTIFIER_PREFIX.length);

  const userRows = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user?.email) {
    // User was deleted between checkout and claim. Treat as not found.
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, tokenHash));
    return { ok: false, reason: "not_found" };
  }

  return {
    ok: true,
    userId,
    email: user.email,
    alreadyClaimed: user.passwordHash !== null && user.passwordHash !== "",
  };
}

export type WelcomeConsume =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Consume a welcome token. Caller is responsible for setting the
 * password on the user row (we do that in the claim API rather than
 * here so the token consumption and the password update share a
 * transaction).
 */
export async function consumeWelcomeToken(
  token: string,
): Promise<WelcomeConsume> {
  if (!token) return { ok: false, reason: "not_found" };
  const tokenHash = hash(token);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, tokenHash))
      .limit(1);
    const row = rows[0];
    if (!row || !row.identifier.startsWith(IDENTIFIER_PREFIX)) {
      return { ok: false, reason: "not_found" as const };
    }
    if (row.expires.getTime() <= Date.now()) {
      await tx
        .delete(verificationTokens)
        .where(eq(verificationTokens.token, tokenHash));
      return { ok: false, reason: "expired" as const };
    }
    const userId = row.identifier.slice(IDENTIFIER_PREFIX.length);

    const userRows = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = userRows[0];
    if (!user?.email) {
      await tx
        .delete(verificationTokens)
        .where(eq(verificationTokens.token, tokenHash));
      return { ok: false, reason: "not_found" as const };
    }

    // Single-use: drop every welcome row for this user.
    await tx
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, `${IDENTIFIER_PREFIX}${userId}`));

    // Stamp email_verified - paying for a subscription proves the
    // address resolves to the right mailbox.
    await tx
      .update(users)
      .set({ emailVerified: new Date() })
      .where(sql`${users.id} = ${userId}`);

    return { ok: true, userId, email: user.email };
  });
}
