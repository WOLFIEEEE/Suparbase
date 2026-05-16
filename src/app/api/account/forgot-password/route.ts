import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { issueResetToken } from "@/server/auth/password-reset";
import { renderPasswordResetEmail } from "@/server/email/templates/password-reset";
import { sendEmail, isEmailConfigured } from "@/server/email/resend";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { clientIp } from "@/server/security/client-ip";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().trim().min(3).max(120),
});

/**
 * POST /api/auth/forgot-password
 *
 * Always returns 200 with `{ ok: true, configured: <bool> }` — the
 * shape doesn't reveal whether the email is a known account. That's
 * deliberate enumeration defence; the UI shows the same "if the
 * email matches an account, we sent a link" confirmation either way.
 *
 * `configured: false` is returned only when email isn't wired up at
 * all on this deployment — the UI surfaces that so the user knows
 * to email support directly.
 *
 * Rate-limited per client IP (reuse the signup bucket) to defend
 * against an attacker spamming someone else's inbox.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = checkSignupRate(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        category: "rate_limited",
        message: "Too many reset requests. Try again shortly.",
      },
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
      {
        category: "validation",
        message: parsed.error.issues[0]?.message ?? "Invalid email.",
      },
      { status: 400 },
    );
  }

  if (!isEmailConfigured()) {
    // No email delivery on this deployment — be honest so the UI
    // can show the right message ("email support to reset").
    return NextResponse.json({ ok: true, configured: false });
  }

  try {
    const issued = await issueResetToken(parsed.data.email, ip);
    if (issued) {
      const rendered = renderPasswordResetEmail({
        token: issued.token,
        recipientEmail: issued.userEmail,
        expiresAt: issued.expiresAt,
        requestedFromIp: ip,
      });
      const result = await sendEmail({
        to: issued.userEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tag: "password-reset",
      });
      if (!result.delivered) {
        log.warn("forgot-password: email send failed", {
          reason: result.reason,
          error: result.error,
        });
        // Still return 200 so we don't expose that the email exists.
      }
    }
  } catch (e) {
    log.error("forgot-password: unexpected", { err: (e as Error).message });
    // Same: 200 either way.
  }

  return NextResponse.json({ ok: true, configured: true });
}
