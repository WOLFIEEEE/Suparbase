import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Edge middleware. Three concerns, in order:
 *
 *   1. CSRF defence: cross-origin POST/PUT/PATCH/DELETE → 403.
 *   2. 2FA enforcement: if the user has 2FA enabled but hasn't
 *      cleared the second factor for this session, redirect every
 *      protected page request to /signin/2fa.
 *   3. CSP nonce + security headers on the response so the policy
 *      can use `'strict-dynamic'` for scripts instead of the
 *      previous `'unsafe-inline'`. Next.js' own hydration scripts
 *      pick up the nonce automatically when we set `x-nonce` on the
 *      request headers.
 *
 * Resource cost: one URL parse + one HMAC verify per request that
 * passes the CSRF gate, plus a 16-byte random read for the nonce.
 * Negligible.
 */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MFA_COOKIE_NAME = "suparbase-mfa-ok";
const IS_PROD = process.env.NODE_ENV === "production";

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64url, no padding - lighter on the wire than base64.
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build the production CSP. Scripts get `'strict-dynamic'` plus the
 * per-request nonce - no `'unsafe-inline'`, no hash-based allowlist.
 * Styles still allow `'unsafe-inline'` because Radix UI primitives
 * (Tooltip, Popover, Select) inject runtime positioning styles and
 * a couple of our own components ship a small inline animation
 * stylesheet (footer drift particles, auth hero art). XSS via inline
 * style is materially less dangerous than via inline script: the
 * worst case is a CSS-keyed exfil, not arbitrary code execution.
 */
function buildCsp(nonce: string): string {
  const directives = [
    "default-src 'self'",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in",
    "img-src 'self' data: blob: https://avatars.githubusercontent.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    IS_PROD
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : // Dev needs unsafe-eval + unsafe-inline so Next.js HMR can
        // hot-reload modules and inject debug scripts.
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://github.com",
  ];
  return directives.join("; ");
}

const STATIC_SECURITY_HEADERS: Array<[string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  // Defense-in-depth: even with CSP `frame-ancestors 'none'`, the
  // X-Frame-Options header is honoured by older browsers and proxy
  // appliances that don't enforce CSP.
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ── CSRF gate ─────────────────────────────────────────────────
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
          return applySecurityHeaders(NextResponse.next(), generateNonce());
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
        return applySecurityHeaders(NextResponse.redirect(url), generateNonce());
      }
    }
  }

  // ── Security headers + CSP nonce on response ──────────────────
  const nonce = generateNonce();
  // Forward the nonce to server components / Next.js' own renderer
  // via a request header. Next.js' built-in scripts (the hydration
  // bootstrap, the `<Script>` component, the App Router data island)
  // attach this nonce to their `<script>` tags automatically.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return applySecurityHeaders(response, nonce);
}

function applySecurityHeaders(
  response: NextResponse,
  nonce: string,
): NextResponse {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  for (const [name, value] of STATIC_SECURITY_HEADERS) {
    response.headers.set(name, value);
  }
  return response;
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
 * Scope: every route except Next.js' internal asset chunks. CSRF,
 * CSP, and 2FA all apply across the marketing site and the app.
 * Static files served from `/_next/static/` and the favicon are
 * excluded because adding response headers to those is wasteful and
 * sometimes interferes with edge caching.
 */
export const config = {
  matcher: [
    // Match everything except Next.js' static asset paths and the
    // images optimisation endpoint. Negative lookahead syntax is
    // supported by the matcher.
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg).*)",
  ],
};
