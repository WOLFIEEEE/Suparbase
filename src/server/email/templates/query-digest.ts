import { getSiteUrl } from "@/lib/seo/site";
import type { RenderedEmail } from "./invitation";

export interface QueryDigestEmailInput {
  reportName: string;
  connectionName: string;
  connectionId: string;
  rowCount: number;
  truncated: boolean;
  /** Pre-rendered HTML table of the result (see reports/render.ts). */
  tableHtml: string;
}

/** Transactional email for a scheduled query digest. */
export function renderQueryDigestEmail(input: QueryDigestEmailInput): RenderedEmail {
  const url = `${getSiteUrl()}/c/${input.connectionId}/reports`;
  const subject = `${input.reportName} — ${input.rowCount} row${input.rowCount === 1 ? "" : "s"}`;
  const text = [
    `${input.reportName}`,
    `Connection: ${input.connectionName}`,
    `${input.rowCount} row${input.rowCount === 1 ? "" : "s"}${input.truncated ? " (truncated)" : ""}`,
    ``,
    `Manage this report: ${url}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#fafafa;padding:24px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" align="center" style="background:#fff;border:1px solid #eee;border-radius:8px;max-width:640px">
  <tr><td style="padding:24px 28px 8px 28px">
    <div style="font:600 11px -apple-system,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a8a8a">Scheduled digest</div>
    <h1 style="margin:6px 0 2px;font:700 20px -apple-system,sans-serif;color:#1a1a1a">${escapeHtml(input.reportName)}</h1>
    <div style="font:13px -apple-system,sans-serif;color:#777">${escapeHtml(input.connectionName)} · ${input.rowCount} row${input.rowCount === 1 ? "" : "s"}${input.truncated ? " (truncated)" : ""}</div>
  </td></tr>
  <tr><td style="padding:16px 28px 8px 28px">${input.tableHtml}</td></tr>
  <tr><td style="padding:8px 28px 28px 28px">
    <a href="${escapeHtml(url)}" style="font:13px -apple-system,sans-serif;color:#3b7a3b">Manage this report &rarr;</a>
  </td></tr>
</table></body></html>`;
  return { subject, html, text, url };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
