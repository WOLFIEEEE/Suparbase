import { NextResponse, type NextRequest } from "next/server";
import { createUserAccount, SignupError, SignupSchema } from "@/server/auth/signup";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { issueVerifyToken } from "@/server/auth/email-verification";
import { renderEmailVerificationEmail } from "@/server/email/templates/email-verification";
import { isEmailConfigured, sendEmail } from "@/server/email/resend";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientKey(req: NextRequest): string {
  // x-forwarded-for is what Coolify's Traefik adds; fallback to a constant
  // so behind-localhost dev still rate-limits.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/**
 * Fire-and-forget verification email. Runs after the signup row is
 * committed so a delivery failure can't roll the account back. Logs
 * any failure but never bubbles — the user can request a re-send
 * later from /settings/account.
 */
async function dispatchVerificationEmail(email: string): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const issued = await issueVerifyToken(email);
    if (!issued || issued.token.length === 0) return;
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
      log.warn("signup: verification email send failed", {
        reason: result.reason,
        error: result.error,
      });
    }
  } catch (e) {
    log.error("signup: verification email exception", {
      err: (e as Error).message,
    });
  }
}

export async function POST(req: NextRequest) {
  const limit = checkSignupRate(clientKey(req));
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many sign-ups from this network. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        category: "validation",
        message: first?.message ?? "Invalid input.",
        field: first?.path?.[0] ?? undefined,
      },
      { status: 400 },
    );
  }

  try {
    const user = await createUserAccount(parsed.data);
    // Fire and forget — never block signup on email delivery.
    void dispatchVerificationEmail(user.email);
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (e) {
    if (e instanceof SignupError) {
      const status = e.code === "email_taken" ? 409 : e.code === "validation" ? 400 : 500;
      return NextResponse.json(
        { category: e.code === "email_taken" ? "constraint" : e.code, message: e.message, field: e.field },
        { status },
      );
    }
    return NextResponse.json(
      { category: "server", message: "Could not create account." },
      { status: 500 },
    );
  }
}
