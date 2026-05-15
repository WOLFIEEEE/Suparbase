import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF defence at the edge.
 *
 * The browser always sends an `Origin` header on cross-origin
 * POST/PUT/PATCH/DELETE. For our own SPA, Origin equals the deployment
 * host. Any mismatch is a CSRF attempt; we 403 it before it ever
 * reaches a route handler.
 *
 * What we deliberately allow:
 *   - GET / HEAD / OPTIONS (no side effects)
 *   - Requests with no Origin header (curl, server-to-server,
 *     authenticated internal calls). NextAuth's session cookie still
 *     gates the actual identity, so this isn't the threat model.
 *   - NextAuth's own callback endpoints under /api/auth/*, which need
 *     to accept cross-origin OAuth redirects.
 *
 * Resource cost: one URL parse per unsafe request. Negligible.
 */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  if (!UNSAFE_METHODS.has(req.method)) return NextResponse.next();

  const path = req.nextUrl.pathname;
  // NextAuth handles its own CSRF for sign-in / sign-out via the
  // built-in csrfToken endpoint. Don't second-guess it.
  if (path.startsWith("/api/auth/")) return NextResponse.next();
  // Inbound webhooks are server-to-server (no Origin header) and
  // authenticated by their HMAC signature. Letting an unrelated
  // Origin policy block them would silently stall billing — fail
  // open here and rely on the signature check inside the handler.
  if (path.startsWith("/api/webhooks/")) return NextResponse.next();

  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.next();

  let allowedHost: string;
  try {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.AUTH_URL ??
      `https://${req.headers.get("host") ?? ""}`;
    allowedHost = new URL(siteUrl).host.toLowerCase();
  } catch {
    return NextResponse.next();
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

  if (originHost === allowedHost) return NextResponse.next();

  return NextResponse.json(
    { category: "forbidden", message: "Cross-site request rejected." },
    { status: 403 },
  );
}

/**
 * Scope: every API route (where the threat lives) + every protected
 * page (where the threat would target if it ever escaped). Static
 * assets and the public marketing pages don't need it.
 */
export const config = {
  matcher: [
    "/api/:path*",
    "/c/:path*",
    "/connections/:path*",
    "/settings/:path*",
  ],
};
