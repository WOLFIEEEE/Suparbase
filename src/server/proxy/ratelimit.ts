import "server-only";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const WRITE_BUDGET = 60;       // writes per window
const WINDOW_MS = 60_000;       // 1 minute
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Token-bucket per (user, verb-class). In-memory: resets on deploy and isn't
 * shared across instances. Adequate for v1 single-process deploys; document
 * Upstash Ratelimit as the v2 upgrade.
 */
export function checkWriteRate(userId: string): RateLimitResult {
  const key = `w:${userId}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing) {
    buckets.set(key, { tokens: WRITE_BUDGET - 1, updatedAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // Refill at the rate of WRITE_BUDGET tokens per WINDOW_MS.
  const elapsed = now - existing.updatedAt;
  const refilled = Math.min(WRITE_BUDGET, existing.tokens + (elapsed * WRITE_BUDGET) / WINDOW_MS);

  if (refilled < 1) {
    const retryAfterMs = ((1 - refilled) * WINDOW_MS) / WRITE_BUDGET;
    existing.tokens = refilled;
    existing.updatedAt = now;
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  existing.tokens = refilled - 1;
  existing.updatedAt = now;
  return { allowed: true, retryAfterSeconds: 0 };
}
