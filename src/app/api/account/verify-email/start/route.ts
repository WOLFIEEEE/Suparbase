import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { activeVerifyTokenCount, issueVerifyToken } from "@/server/auth/email-verification";
import { renderEmailVerificationEmail } from "@/server/email/templates/email-verification";
import { isEmailConfigured, sendEmail } from "@/server/email/resend";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { clientIp } from "@/server/security/client-ip";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/account/verify-email/start
 *
 * Two modes:
 *   1. Authenticated: re-send the verification email to the
 *      signed-in user's email (ignores any body).
 *   2. Anonymous: accept `{ email }` in the body - used by the
 *      sign-up page to fire the initial verification email
 *      immediately after account creation. Enumeration-resistant:
 *      always returns 200.
 *
 * Per-(ip + email) rate limit caps spam. Max 5 active tokens per
 * email (older ones invalidated on each new issue).
 */
const BodySchema = z.object({
  email: z.string().trim().min(3).max(120).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: "Invalid input." },
      { status: 400 },
    );
  }

  const session = await auth();
  const email = session?.user?.email ?? parsed.data.email ?? null;
  if (!email) {
    return NextResponse.json(
      { category: "validation", message: "Provide an email or sign in first." },
      { status: 400 },
    );
  }

  // Rate-limit per (ip + email).
  const ip = clientIp(req);
  const limit = checkSignupRate(`verify:${ip}:${email.toLowerCase()}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many verification requests. Wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true, configured: false });
  }

  // Soft cap on active tokens (older ones are cleared on issuance,
  // but the count is still useful for visibility).
  const active = await activeVerifyTokenCount(email);
  if (active > 5) {
    log.warn("verify-email: too many active tokens", { email });
  }

  try {
    const issued = await issueVerifyToken(email);
    if (issued && issued.token.length > 0) {
      const rendered = renderEmailVerificationEmail({
        token: issued.token,
        recipientEmail: issued.userEmail,
        expiresAt: issued.expiresAt,
      });
      const result = await sendEmail({
        to: issued.userEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tag: "email-verification",
      });
      if (!result.delivered) {
        log.warn("verify-email: send failed", {
          reason: result.reason,
          error: result.error,
        });
      }
    }
  } catch (e) {
    log.error("verify-email: unexpected", { err: (e as Error).message });
  }

  return NextResponse.json({ ok: true, configured: true });
}
