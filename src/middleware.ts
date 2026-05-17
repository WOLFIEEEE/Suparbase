import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Edge middleware. Two concerns, in order:
 *
 *   1. CSRF defence: cross-origin POST/PUT/PATCH/DELETE → 403.
 *   2. 2FA enforcement: if the user has 2FA enabled but hasn't
 *      cleared the second factor for this session, redirect every
 *      protected page request to /signin/2fa.
 *
 * Resource cost: one URL parse + one HMAC verify per request that
 * passes the CSRF gate. Negligible.
 */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MFA_COOKIE_NAME = "suparbase-mfa-ok";

export async function middleware(req: NextRequest) {
  // ── CSRF gate ─────────────────────────────────────────────────
  const path = req.nextUrl.pathname;
  if (UNSAFE_METHODS.has(req.method)) {
    // NextAuth handles its own CSRF for sign-in / sign-out via the
    // built-in csrfToken endpoint. Don't second-guess it.
    if (!path.startsWith("/api/auth/") && !path.startsWith("/api/webhooks/")) {
      const origin = req.headers.get("origin");
      if (origin) {
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
        if (originHost !== allowedHost) {
          return NextResponse.json(
            { category: "forbidden", message: "Cross-site request rejected." },
            { status: 403 },
          );
        }
      }
    }
  }

  // ── 2FA enforcement ───────────────────────────────────────────
  // Only gate protected pages, not API routes or the 2FA flow itself.
  if (isMfaProtectedPath(path)) {
    const token = (await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      salt:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
    })) as { id?: string; requires2FA?: boolean } | null;
    if (token?.requires2FA && token.id) {
      const cookie = req.cookies.get(MFA_COOKIE_NAME)?.value;
      const ok = await verifyMfaCookieEdge(cookie, token.id, process.env.AUTH_SECRET ?? "");
      if (!ok) {
        const url = req.nextUrl.clone();
        url.pathname = "/signin/2fa";
        url.searchParams.set("next", path);
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

/**
 * True when the path is a customer-facing protected page that
 * should be gated behind 2FA. API routes are intentionally NOT in
 * this list - the verify endpoints (`/api/account/2fa/verify`) need
 * to be reachable WHILE the user is in the pending-2FA state.
 *
 * The page-level gate is sufficient: the only way to do anything
 * in the app is via the UI, which goes through these paths.
 */
function isMfaProtectedPath(path: string): boolean {
  if (path === "/signin/2fa") return false;
  if (path.startsWith("/api/")) return false;
  if (path.startsWith("/_next/")) return false;
  return (
    path.startsWith("/c/") ||
    path.startsWith("/connections") ||
    path.startsWith("/settings") ||
    path.startsWith("/admin")
  );
}

/**
 * Edge-compatible HMAC verify for the MFA cookie. Mirrors
 * `verifyMfaCookie()` in `src/server/auth/totp.ts` but uses Web
 * Crypto instead of node:crypto (the latter isn't available in
 * Edge runtime).
 */
async function verifyMfaCookieEdge(
  value: string | undefined,
  userId: string,
  secret: string,
): Promise<boolean> {
  if (!value || !secret) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [cookieUserId, expiresAtStr, sig] = parts;
  if (cookieUserId !== userId) return false;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  if (!sig) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${cookieUserId}.${expiresAtStr}`),
  );
  const expected = base64UrlEncode(new Uint8Array(expectedBuf));
  return constantTimeEquals(sig, expected);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Scope: every API route (where the CSRF threat lives) + every
 * protected page (where 2FA enforcement applies). Static assets and
 * the public marketing pages don't need either.
 */
export const config = {
  matcher: ["/api/:path*", "/c/:path*", "/connections/:path*", "/settings/:path*", "/admin/:path*"],
};
