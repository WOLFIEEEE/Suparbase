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
function check(prefix: string, userId: string, budget: number, windowMs: number): RateLimitResult {
  const key = `${prefix}:${userId}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing) {
    buckets.set(key, { tokens: budget - 1, updatedAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const elapsed = now - existing.updatedAt;
  const refilled = Math.min(budget, existing.tokens + (elapsed * budget) / windowMs);

  if (refilled < 1) {
    const retryAfterMs = ((1 - refilled) * windowMs) / budget;
    existing.tokens = refilled;
    existing.updatedAt = now;
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  existing.tokens = refilled - 1;
  existing.updatedAt = now;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function checkWriteRate(userId: string): RateLimitResult {
  return check("w", userId, WRITE_BUDGET, WINDOW_MS);
}

const AI_BUDGET = 10;          // analyses per hour per user
const AI_WINDOW_MS = 60 * 60_000;

export function checkAiRate(userId: string): RateLimitResult {
  return check("ai", userId, AI_BUDGET, AI_WINDOW_MS);
}

const SIGNUP_BUDGET = 5;
const SIGNUP_WINDOW_MS = 60 * 60_000;

export function checkSignupRate(clientKey: string): RateLimitResult {
  return check("signup", clientKey, SIGNUP_BUDGET, SIGNUP_WINDOW_MS);
}
