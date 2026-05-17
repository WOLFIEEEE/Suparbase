/**
 * Team-invitation email template. HTML is intentionally simple so it
 * renders the same in every client (no external CSS, table layout
 * where it matters, dark-mode-friendly neutrals).
 */

import { getSiteUrl } from "@/lib/seo/site";

export interface InvitationEmailInput {
  /** Token from connection_invitation. URL is built here. */
  token: string;
  /** Person the email is addressed to. */
  recipientEmail: string;
  /** Name shown on the connection card. */
  connectionName: string;
  /** Role they're being invited as. */
  role: "editor" | "viewer";
  /** Who sent the invite, if known. */
  inviterEmail: string | null;
  /** Expiry timestamp (ISO). */
  expiresAt: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  /** Where the link points. Exposed so the API can also return it
   *  for the in-app share-link dialog. */
  url: string;
}

export function renderInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const url = `${getSiteUrl()}/invitations/${encodeURIComponent(input.token)}`;
  const inviter = input.inviterEmail || "your teammate";
  const expires = new Date(input.expiresAt);
  const expiresHuman = expires.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const subject = `${inviter} invited you to ${input.connectionName} on Suparbase`;

  const text = [
    `${inviter} invited you to join "${input.connectionName}" on Suparbase`,
    `as a ${input.role}.`,
    ``,
    `Accept the invitation here:`,
    url,
    ``,
    `This link expires on ${expiresHuman}. Sign in with`,
    `${input.recipientEmail} to accept, the email on the invitation`,
    `must match the email on your Suparbase account.`,
    ``,
    `If you weren't expecting this invite, you can safely ignore it.`,
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
                  You&rsquo;ve been invited to <span style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;">${escape(input.connectionName)}</span>
                </h1>
                <p style="margin:16px 0 0 0;font-size:14px;line-height:1.55;color:#4e4e54;">
                  ${escape(inviter)} invited you to join the <strong>${escape(input.connectionName)}</strong>
                  workspace on Suparbase as a <strong style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;color:#111113;">${escape(input.role)}</strong>.
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
                        Accept invitation &rarr;
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
                  This invitation is for <strong style="color:#111113;">${escape(input.recipientEmail)}</strong>
                  and expires on <strong style="color:#111113;">${expiresHuman}</strong>.
                  Sign in with that email to accept. Suparbase verifies the address before adding you to the workspace.
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:0 32px 28px 32px;">
                <p style="margin:0;font-size:11px;line-height:1.55;color:#999;">
                  If you weren&rsquo;t expecting this invitation, you can safely ignore the email.
                  No account will be created.
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
