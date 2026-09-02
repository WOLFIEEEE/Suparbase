import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/server/admin/guard";
import {
  getEmailConfig,
  isEmailConfigured,
  sendEmail,
} from "@/server/email/resend";
import { getSiteUrl } from "@/lib/seo/site";
import { checkAdminEmailRate } from "@/server/proxy/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/email/test
 *
 * Fires a real email through the Resend pipeline and returns the
 * full server response, so an operator can verify the integration
 * from the admin panel without tailing logs.
 *
 *   Body: { to?: string }      // defaults to the admin's own email
 *
 *   Success: 200 { ok: true, id, to, from, replyTo, configured }
 *   Failure: 200 { ok: false, reason, error, configured, ... }
 *
 * We deliberately return 200 even on failure so the UI can render
 * the structured error inline (`reason: "no_key" | "no_from" |
 * "failed"`) without having to interpret an HTTP status.
 */

const TestSchema = z.object({
  to: z
    .string()
    .trim()
    .email()
    .max(254)
    .optional(),
});

export async function POST(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    // Don't acknowledge the admin surface to non-admins.
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }
  const limit = checkAdminEmailRate(admin.userId);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate_limited",
        error: "Too many diagnostic sends. Try again shortly.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Empty / non-JSON body is fine - we'll default `to` to the admin.
  }
  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: "validation",
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
      },
      { status: 200 },
    );
  }

  const config = getEmailConfig();
  const to = parsed.data.to ?? admin.email;

  if (!isEmailConfigured() || !config.from) {
    return NextResponse.json({
      ok: false,
      reason: config.reason ?? "no_key",
      error:
        config.reason === "no_key"
          ? "RESEND_API_KEY is not set on this deployment."
          : config.reason === "no_from"
          ? "EMAIL_FROM is not set on this deployment."
          : "Email is not configured.",
      configured: false,
      from: config.from,
      replyTo: config.replyTo,
      to,
    });
  }

  const subject = "Suparbase test email";
  const text = [
    "This is a test email from your Suparbase deployment.",
    "",
    `Triggered by ${admin.email} at ${new Date().toISOString()}.`,
    `Site: ${getSiteUrl()}`,
    "",
    "If you got this, your Resend wiring is working end-to-end:",
    "  - RESEND_API_KEY is valid",
    "  - EMAIL_FROM domain is verified on Resend",
    "  - The send call succeeded",
    "  - Delivery reached the inbox (or spam folder)",
    "",
    "- Suparbase",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111113;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f4;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e7e3;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:28px 32px;">
          <div style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#888;">Suparbase &middot; admin probe</div>
          <h1 style="margin:8px 0 0 0;font-size:20px;line-height:1.3;color:#111113;">Test email</h1>
          <p style="margin:14px 0 0 0;font-size:14px;line-height:1.55;color:#4e4e54;">
            Triggered by <strong>${escapeHtml(admin.email)}</strong> at
            <code style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">${escapeHtml(new Date().toISOString())}</code>.
          </p>
          <p style="margin:14px 0 0 0;font-size:13px;line-height:1.55;color:#4e4e54;">
            If you got this, your Resend wiring is working end-to-end: the API key resolves,
            the sender domain is verified, and Resend accepted + delivered the message.
          </p>
          <p style="margin:18px 0 0 0;font-size:11px;color:#999;">
            Site: <a href="${escapeHtml(getSiteUrl())}" style="color:#888;">${escapeHtml(getSiteUrl())}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const startedAt = Date.now();
  const result = await sendEmail({
    to,
    subject,
    html,
    text,
    tag: "admin-test",
  });
  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: result.delivered,
    id: result.id,
    reason: result.reason,
    error: result.error,
    configured: true,
    from: config.from,
    replyTo: config.replyTo,
    to,
    elapsedMs,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
