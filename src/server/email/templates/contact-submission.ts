/**
 * Contact-form submission template. Sent TO the Suparbase team's inbox
 * (contact@suparbase.com or CONTACT_INBOX env override) whenever a
 * visitor submits /contact. Reply-To is set to the visitor's address so
 * operators can reply directly from their mail client.
 *
 * Keep this template plain: every field is escaped before interpolation
 * and we never echo URLs or HTML from the submitter into a link href.
 */

import { getSiteUrl } from "@/lib/seo/site";
import { CONTACT_TOPIC_LABEL, type ContactTopic } from "@/lib/contact/topics";

export type { ContactTopic };

export interface ContactSubmissionInput {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  /** Source URL, e.g. /pricing if the form was opened from the pricing page. */
  referrer?: string | null;
  /** Best-effort client IP, recorded for abuse triage only. */
  ip?: string | null;
}

export interface RenderedContactEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderContactSubmissionEmail(
  input: ContactSubmissionInput,
): RenderedContactEmail {
  const topicLabel = CONTACT_TOPIC_LABEL[input.topic] ?? "General question";
  const subject = `[${topicLabel}] ${input.name} via Suparbase contact form`;

  const referrer = input.referrer?.trim() || "(unknown)";
  const ip = input.ip?.trim() || "(not recorded)";

  const text = [
    `New contact submission`,
    `Topic:   ${topicLabel}`,
    `From:    ${input.name} <${input.email}>`,
    `Source:  ${referrer}`,
    `IP:      ${ip}`,
    ``,
    `Message:`,
    `--------`,
    input.message,
    `--------`,
    ``,
    `Reply directly to this email to respond. Reply-To is set to the`,
    `visitor's address.`,
    ``,
    `Suparbase`,
    getSiteUrl(),
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
              <td style="padding:28px 32px 0 32px;">
                <div style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#888;">
                  Suparbase &middot; contact form
                </div>
                <h1 style="margin:8px 0 0 0;font-size:20px;line-height:1.3;color:#111113;">
                  ${escape(topicLabel)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;font-size:13px;line-height:1.6;color:#4e4e54;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:6px 0;color:#777;width:96px;">From</td>
                    <td style="padding:6px 0;color:#111113;">
                      <strong>${escape(input.name)}</strong>
                      &lt;<a href="mailto:${escape(input.email)}" style="color:#4a6e17;text-decoration:none;">${escape(input.email)}</a>&gt;
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#777;">Source</td>
                    <td style="padding:6px 0;color:#111113;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">${escape(referrer)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#777;">IP</td>
                    <td style="padding:6px 0;color:#111113;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">${escape(ip)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 8px 32px;">
                <div style="padding:14px 16px;background:#f4f4f0;border:1px solid #e2e2dc;border-radius:8px;font-size:14px;line-height:1.6;color:#111113;white-space:pre-wrap;">${escape(input.message)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px 32px;">
                <p style="margin:0;font-size:11px;line-height:1.55;color:#999;">
                  Reply to this email to respond directly. Reply-To is set to the visitor.
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

  return { subject, html, text };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
