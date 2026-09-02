import "server-only";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { apiTokens } from "@/server/schema/api-tokens";
import { generateToken, hashToken } from "./token";

const MAX_TOKENS_PER_USER = 20;
const LAST_USED_THROTTLE_MS = 60_000;

export interface ApiTokenSummary {
  id: string;
  name: string;
  prefix: string;
  scope: "read";
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function toSummary(row: typeof apiTokens.$inferSelect): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTokens(userId: string): Promise<ApiTokenSummary[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
    .limit(MAX_TOKENS_PER_USER * 2);
  return rows.map(toSummary);
}

export async function countActiveTokens(userId: string): Promise<number> {
  const rows = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
  return rows.length;
}

export { MAX_TOKENS_PER_USER };

/** Create a token; the plaintext is returned exactly once. */
export async function createToken(
  userId: string,
  name: string,
  expiresAt: Date | null,
): Promise<{ token: ApiTokenSummary; plaintext: string }> {
  const generated = generateToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name,
      tokenHash: generated.hash,
      prefix: generated.prefix,
      expiresAt,
    })
    .returning();
  return { token: toSummary(row!), plaintext: generated.plaintext };
}

export async function revokeToken(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.userId, userId), eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

export interface AuthenticatedToken {
  tokenId: string;
  userId: string;
}

/**
 * Resolve a plaintext token to its owner. Revoked and expired tokens
 * resolve to null. `last_used_at` is bumped at most once a minute so a
 * scripted poller doesn't turn every request into a write.
 */
export async function authenticateToken(plaintext: string): Promise<AuthenticatedToken | null> {
  const hash = hashToken(plaintext);
  const rows = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  const stale = !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
  if (stale) {
    const threshold = new Date(Date.now() - LAST_USED_THROTTLE_MS);
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(apiTokens.id, row.id), row.lastUsedAt ? lt(apiTokens.lastUsedAt, threshold) : isNull(apiTokens.lastUsedAt)));
  }
  return { tokenId: row.id, userId: row.userId };
}
