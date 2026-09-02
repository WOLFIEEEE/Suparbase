import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import {
  consumeRecoveryCode,
  MFA_COOKIE_NAME,
  signMfaCookie,
  verifyTotpForUser,
} from "@/server/auth/totp";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { clientIp } from "@/server/security/client-ip";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  /** Either a 6-digit TOTP code or a 10-char recovery code (with optional dashes). */
  code: z.string().min(6).max(20),
  /** When true, treat `code` as a recovery code rather than TOTP. */
  recovery: z.boolean().optional(),
});

/**
 * POST /api/account/2fa/verify
 *
 * Called from /signin/2fa after the user has signed in with
 * password but not yet completed the second factor. Verifies the
 * code, then sets the signed `suparbase-mfa-ok` cookie so the
 * middleware lets them through for the next 24 hours.
 *
 * Rate-limited per IP via the signup bucket to slow brute-force
 * attempts against the TOTP window.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const ip = clientIp(req);
  const limit = checkSignupRate(`mfa:${ip}:${userId}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many attempts. Wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { category: "validation", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: "Invalid input." },
      { status: 400 },
    );
  }

  const ok = parsed.data.recovery
    ? await consumeRecoveryCode(userId, parsed.data.code)
    : await verifyTotpForUser(userId, parsed.data.code);
  if (!ok) {
    log.info("2fa verify failed", { userId, recovery: parsed.data.recovery });
    return NextResponse.json(
      {
        category: "bad_code",
        message: parsed.data.recovery
          ? "Recovery code didn't match (or already used)."
          : "That code didn't match. Try the current one from your authenticator.",
      },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(MFA_COOKIE_NAME, signMfaCookie(userId, session.user.authAt ?? 0), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
  return NextResponse.json({ ok: true });
}
