import "server-only";
import type { NextRequest } from "next/server";

/**
 * Best-effort client IP. Order of preference:
 *   1. `x-forwarded-for` (first hop, trimmed)
 *   2. `x-real-ip`
 *   3. `"unknown"` fallback
 *
 * Used by rate-limit buckets that key on caller identity for
 * pre-auth endpoints (forgot-password, reset-password, 2fa/verify).
 * The trust model is "behind Coolify/Vercel/whatever sets the
 * standard forwarded headers" — these headers MUST NOT be trusted
 * if the app is exposed directly to the internet without an L7
 * proxy in front (which would also be a deployment bug).
 */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
