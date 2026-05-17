/**
 * Welcome-payment email template. Sent immediately after a guest
 * checkout creates a pending user row, BEFORE the Dodo session is
 * completed. The plaintext welcome token is embedded in the link so
 * the user can claim their account either:
 *   - by returning to Dodo's success page (which redirects back
 *     here with the same token in the URL), or
 *   - by clicking the link in this email at any point in the next
 *     7 days, even if they abandoned the browser tab.
 *
 * Same visual language as the other transactional templates.
 */

import { getSiteUrl } from "@/lib/seo/site";
import type { RenderedEmail } from "./invitation";

export interface WelcomePaymentEmailInput {
  /** Plaintext welcome token. */
  token: string;
  /** Recipient email. */
  recipientEmail: string;
  /** Plan label (Hosted, Team, etc.) for the subject + body. */
  planLabel: string;
  /** Cadence label (monthly / annual). */
  cadenceLabel: string;
  /** Expiry timestamp. */
  expiresAt: Date | string;
}

export function renderWelcomePaymentEmail(
  input: WelcomePaymentEmailInput,
): RenderedEmail {
  const url = `${getSiteUrl()}/welcome/${encodeURIComponent(input.token)}`;
  const expires =
    input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
  const expiresHuman = expires.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const subject = `Welcome to Suparbase ${input.planLabel}`;

  const text = [
    `Welcome to Suparbase ${input.planLabel} (${input.cadenceLabel})`,
    ``,
    `Click the link below to set a password and finish setting up your`,
    `account. The link is single-use and expires on ${expiresHuman}.`,
    ``,
    url,
    ``,
    `Your subscription is already active - this email just helps you`,
    `claim the account it's attached to.`,
    ``,
    `If you didn't pay for Suparbase, please contact us via`,
    `${getSiteUrl()}/contact - someone may have used your email`,
    `address by mistake.`,
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
                <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:#111113;">
                  Welcome to ${escape(input.planLabel)}
                </h1>
                <p style="margin:16px 0 0 0;font-size:14px;line-height:1.55;color:#4e4e54;">
                  Your <strong>${escape(input.cadenceLabel)}</strong> subscription is active. One last step: set a password so you can sign in.
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
                        Claim your account &rarr;
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
                  This link is single-use and expires on <strong style="color:#111113;">${expiresHuman}</strong>.
                  After that, use <a href="${escape(getSiteUrl())}/forgot" style="color:#4a6e17;">forgot password</a> to set one - your subscription stays attached to <strong style="color:#111113;">${escape(input.recipientEmail)}</strong> either way.
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px 28px 32px;">
                <p style="margin:0;font-size:11px;line-height:1.55;color:#999;">
                  Didn&rsquo;t pay for Suparbase? Someone may have used your email
                  by mistake. Reply or contact us via
                  <a href="${escape(getSiteUrl())}/contact" style="color:#888;">${escape(getSiteUrl())}/contact</a> and we&rsquo;ll cancel the subscription.
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
