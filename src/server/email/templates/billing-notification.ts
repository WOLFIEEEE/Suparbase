/**
 * Billing-notification email template. Single template, three
 * variants. Sent from the Dodo webhook handler when an event fires
 * that doesn't mutate subscription state but the customer needs to
 * know about it:
 *
 *   - payment_failed:   "We couldn't charge your card."
 *   - payment_refunded: "Your refund has been processed."
 *   - trial_ending:     "Your trial ends in N days."
 *
 * No copy is templated from user-supplied input - everything is
 * derived from the trusted Dodo payload or static strings, so HTML
 * injection isn't a concern.
 */

import { getSiteUrl } from "@/lib/seo/site";
import type { RenderedEmail } from "./invitation";
import type { BillingNotificationKind } from "@/server/billing/dodo-events";

export interface BillingNotificationInput {
  kind: BillingNotificationKind;
  recipientEmail: string;
  /** ISO timestamp (when applicable). */
  trialEndsAt?: string | null;
}

interface Copy {
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
}

function copyFor(input: BillingNotificationInput): Copy {
  switch (input.kind) {
    case "payment_failed":
      return {
        subject: "Suparbase: we couldn't charge your card",
        heading: "Payment problem",
        body:
          "We tried to renew your Suparbase subscription, and your card declined the charge. Dodo will retry over the next few days. To skip the retries, update your payment method now from your billing page.",
        ctaLabel: "Update payment method",
        ctaPath: "/settings/billing",
      };
    case "payment_refunded":
      return {
        subject: "Suparbase: your refund has been processed",
        heading: "Refund processed",
        body:
          "Dodo Payments has processed a refund on your Suparbase subscription. The funds should hit your account within 5-10 business days, depending on your bank. Your access remains active for the rest of the period you've paid for.",
        ctaLabel: "View billing",
        ctaPath: "/settings/billing",
      };
    case "trial_ending":
      const ends = input.trialEndsAt
        ? new Date(input.trialEndsAt).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "soon";
      return {
        subject: "Suparbase: your trial ends soon",
        heading: "Trial ending",
        body: `Your Suparbase trial ends on ${ends}. Add a payment method to keep your subscription active. If you don't, your account will drop back to the Free plan, which includes up to 3 connections.`,
        ctaLabel: "Add payment method",
        ctaPath: "/settings/billing",
      };
  }
}

export function renderBillingNotificationEmail(
  input: BillingNotificationInput,
): RenderedEmail {
  const c = copyFor(input);
  const url = `${getSiteUrl()}${c.ctaPath}`;

  const text = [
    c.heading,
    ``,
    c.body,
    ``,
    `${c.ctaLabel}: ${url}`,
    ``,
    `Questions? Reply to this email or visit ${getSiteUrl()}/contact.`,
    ``,
    `- Suparbase`,
    `${getSiteUrl()}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escape(c.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111113;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f4;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e7e3;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 0 32px;">
                <div style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#888;">
                  Suparbase &middot; billing
                </div>
                <h1 style="margin:8px 0 0 0;font-size:20px;line-height:1.3;color:#111113;">
                  ${escape(c.heading)}
                </h1>
                <p style="margin:16px 0 0 0;font-size:14px;line-height:1.55;color:#4e4e54;">
                  ${escape(c.body)}
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
                        ${escape(c.ctaLabel)} &rarr;
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px 32px;">
                <p style="margin:0;font-size:11px;line-height:1.55;color:#999;">
                  Questions? Reply to this email, or use the form at
                  <a href="${escape(getSiteUrl())}/contact" style="color:#888;">${escape(getSiteUrl())}/contact</a>.
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

  return { subject: c.subject, html, text, url };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
