/**
 * Email-verification template. Same visual language as the team
 * invitation + password reset.
 */

import { getSiteUrl } from "@/lib/seo/site";
import type { RenderedEmail } from "./invitation";

export interface EmailVerificationInput {
  /** Plaintext token (goes in the URL). */
  token: string;
  recipientEmail: string;
  /** Expiry timestamp (Date or ISO string). */
  expiresAt: Date | string;
}

export function renderEmailVerificationEmail(
  input: EmailVerificationInput,
): RenderedEmail {
  const url = `${getSiteUrl()}/verify-email/${encodeURIComponent(input.token)}`;
  const expires =
    input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
  const expiresHuman = expires.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const subject = "Verify your Suparbase email";
  const text = [
    `Verify your Suparbase email`,
    ``,
    `Click the link below to confirm you own ${input.recipientEmail}.`,
    `This link works once and expires on ${expiresHuman}.`,
    ``,
    url,
    ``,
    `If you didn't create a Suparbase account, ignore this email - no`,
    `account will be created.`,
    ``,
    `- Suparbase`,
    `${getSiteUrl()}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escape(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111113;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e7e3;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 0 32px;">
                <div style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#888;">
                  Suparbase
                </div>
                <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.25;color:#111113;">
                  Confirm your email
                </h1>
                <p style="margin:16px 0 0 0;font-size:14px;line-height:1.55;color:#4e4e54;">
                  We need to confirm that
                  <strong style="color:#111113;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;">${escape(input.recipientEmail)}</strong>
                  is yours before we can deliver invitations, password resets, and account
                  notices. This link works once and expires on <strong>${escape(expiresHuman)}</strong>.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td bgcolor="#4a6e17" style="border-radius:8px;">
                      <a href="${escape(url)}"
                         style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                        Verify email &rarr;
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 32px 0 32px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#777;">
                  Or copy this link into your browser:<br />
                  <a href="${escape(url)}" style="word-break:break-all;color:#4a6e17;">${escape(url)}</a>
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 28px 32px;">
                <p style="margin:0;font-size:11px;line-height:1.55;color:#999;">
                  Didn&rsquo;t create an account? Ignore the email. We won&rsquo;t verify
                  the address without this click.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:18px 0 0 0;font-size:11px;color:#999;">
            Suparbase &middot;
            <a href="${escape(getSiteUrl())}" style="color:#888;text-decoration:none;">${escape(getSiteUrl().replace(/^https?:\/\//, ""))}</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text, url };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
