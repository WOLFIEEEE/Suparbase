import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  checkAiRate,
  checkBulkRate,
  checkReadRate,
  checkWriteRate,
} from "@/server/proxy/ratelimit";

/**
 * Tiny helpers that compress the "rate-limit-or-respond-429" boilerplate
 * each route would otherwise spell out three times. Each one returns a
 * NextResponse to return immediately, or null to continue.
 *
 * Usage:
 *   const limited = limitOr429(session.user.id, "write");
 *   if (limited) return limited;
 */
export function limitOr429(
  userId: string,
  bucket: "write" | "read" | "bulk" | "ai",
): NextResponse | null {
  const limit =
    bucket === "write"
      ? checkWriteRate(userId)
      : bucket === "read"
      ? checkReadRate(userId)
      : bucket === "bulk"
      ? checkBulkRate(userId)
      : checkAiRate(userId);
  if (limit.allowed) return null;
  return NextResponse.json(
    {
      category: "rate_limited",
      message: `Too many ${bucket} requests, try again shortly.`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    },
  );
}

/**
 * Reject cross-site POST/PUT/PATCH/DELETE requests by comparing the
 * `Origin` header against this deployment's site URL. Browsers always
 * send `Origin` for these methods on cross-origin requests, so an empty
 * or mismatched value is a CSRF red flag.
 *
 * GET / HEAD requests are not protected (they don't write); same-origin
 * fetches from the SPA pass because the browser sets Origin to the same
 * origin. Authenticated cookie writes without Origin fail closed.
 *
 * Returns null when the request is OK, or a 403 response.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfOr403(req: NextRequest): NextResponse | null {
  if (!UNSAFE_METHODS.has(req.method)) return null;
  const origin = req.headers.get("origin");
  if (!origin) {
    return req.headers.has("cookie")
      ? NextResponse.json(
          { category: "forbidden", message: "Origin header is required for authenticated writes." },
          { status: 403 },
        )
      : null;
  }
  let allowedHost: string;
  try {
    // Prefer the explicit canonical URL the deployment was configured
    // with; fall back to the request host as a last resort.
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.AUTH_URL ??
      `https://${req.headers.get("host") ?? ""}`;
    allowedHost = new URL(siteUrl).origin.toLowerCase();
  } catch {
    return NextResponse.json(
      { category: "server", message: "Canonical site URL is not configured correctly." },
      { status: 500 },
    );
  }
  let originHost: string;
  try {
    originHost = new URL(origin).origin.toLowerCase();
  } catch {
    return NextResponse.json(
      { category: "forbidden", message: "Invalid Origin header." },
      { status: 403 },
    );
  }
  const devRequestOrigin = process.env.NODE_ENV !== "production"
    ? req.nextUrl.origin.toLowerCase()
    : null;
  if (originHost === allowedHost || originHost === devRequestOrigin) return null;
  return NextResponse.json(
    { category: "forbidden", message: "Cross-site request rejected." },
    { status: 403 },
  );
}
