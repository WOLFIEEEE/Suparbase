/**
 * Password-reset email template. Same visual language as the team
 * invitation: simple HTML, no external CSS, table layout where it
 * matters, dark-mode-friendly neutrals.
 */

import { getSiteUrl } from "@/lib/seo/site";
import type { RenderedEmail } from "./invitation";

export interface PasswordResetEmailInput {
  /** Plaintext token (the bytes from the URL). */
  token: string;
  /** Recipient email. */
  recipientEmail: string;
  /** Expiry timestamp (Date or ISO string). */
  expiresAt: Date | string;
  /** IP the reset request came from. Surfaced so the user can spot
   *  unsolicited requests. */
  requestedFromIp?: string | null;
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const url = `${getSiteUrl()}/reset/${encodeURIComponent(input.token)}`;
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

  const subject = "Reset your Suparbase password";

  const ipLine = input.requestedFromIp
    ? `Requested from ${input.requestedFromIp}. If that doesn't sound like you, ignore this email - your password stays unchanged.`
    : `If you didn't ask for this, ignore the email - your password stays unchanged.`;

  const text = [
    `Reset your Suparbase password`,
    ``,
    `Click the link below to choose a new password. It expires on ${expiresHuman}.`,
    ``,
    url,
    ``,
    ipLine,
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
                  Reset your password
                </h1>
                <p style="margin:16px 0 0 0;font-size:14px;line-height:1.55;color:#4e4e54;">
                  Choose a new password for the Suparbase account at
                  <strong style="color:#111113;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;">${escape(input.recipientEmail)}</strong>.
                  This link expires on <strong>${escape(expiresHuman)}</strong>.
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
                        Reset password &rarr;
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
              <td style="padding:24px 32px;">
                <div style="padding:12px 14px;background:#f4f4f0;border:1px solid #e2e2dc;border-radius:8px;font-size:12px;line-height:1.55;color:#555;">
                  ${escape(ipLine)}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px 28px 32px;">
                <p style="margin:0;font-size:11px;line-height:1.55;color:#999;">
                  The link can only be used once. After you reset, all your existing
                  sign-in sessions stay active - sign out and back in if you suspect
                  someone else used your old password.
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
