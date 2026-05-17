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
 * host. Non-browser clients (curl, server-to-server) without an Origin
 * header are also allowed through - they're already auth'd via the
 * NextAuth session cookie, which carries the actual identity proof, and
 * a curl user explicitly intending to call the API is not the CSRF
 * threat model.
 *
 * Returns null when the request is OK, or a 403 response.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfOr403(req: NextRequest): NextResponse | null {
  if (!UNSAFE_METHODS.has(req.method)) return null;
  const origin = req.headers.get("origin");
  if (!origin) return null; // see docstring - server-to-server / curl are OK
  let allowedHost: string;
  try {
    // Prefer the explicit canonical URL the deployment was configured
    // with; fall back to the request host as a last resort.
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.AUTH_URL ??
      `https://${req.headers.get("host") ?? ""}`;
    allowedHost = new URL(siteUrl).host.toLowerCase();
  } catch {
    return null; // misconfigured env, fail-open rather than break the app
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return NextResponse.json(
      { category: "forbidden", message: "Invalid Origin header." },
      { status: 403 },
    );
  }
  if (originHost === allowedHost) return null;
  return NextResponse.json(
    { category: "forbidden", message: "Cross-site request rejected." },
    { status: 403 },
  );
}
