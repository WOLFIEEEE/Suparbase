import { NextResponse, type NextRequest } from "next/server";
import { redact } from "@/lib/redact";
import { getConnectionForUser } from "@/server/connections/repo";
import { verifyCronAuth } from "@/server/security/cron-auth";
import { executeSql } from "@/server/proxy/sql-playground";
import { listDueReports, markReportRun, reportSnippetSql } from "@/server/reports/repo";
import { resultToHtmlTable } from "@/server/reports/render";
import { sendEmail } from "@/server/email/resend";
import { renderQueryDigestEmail } from "@/server/email/templates/query-digest";
import { validateWebhookUrl } from "@/server/actions/repo";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const REPORT_TIMEOUT_MS = 30_000;

/**
 * Runs every scheduled report whose interval has elapsed: executes the
 * report's snippet read-only, then delivers the result by email or webhook.
 * Same Bearer-CRON_SECRET contract as the other cron routes.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { category: "no_key", message: "CRON_SECRET is not configured; scheduled reports are disabled." },
      { status: 503 },
    );
  }
  if (!verifyCronAuth(req.headers.get("authorization"), secret)) {
    return NextResponse.json(
      { category: "unauthorized", message: "Bad or missing Authorization." },
      { status: 401 },
    );
  }

  const due = await listDueReports();
  const results: Array<{ reportId: string; status: string; error?: string }> = [];

  for (const report of due) {
    try {
      const conn = await getConnectionForUser(report.userId, report.connectionId);
      if (!conn || !conn.encryptedPostgresUrl) {
        await markReportRun(report.id, "skipped", "missing connection or Postgres URL");
        results.push({ reportId: report.id, status: "skipped" });
        continue;
      }
      const sqlText = await reportSnippetSql(report);
      if (!sqlText) {
        await markReportRun(report.id, "skipped", "snippet no longer exists");
        results.push({ reportId: report.id, status: "skipped" });
        continue;
      }

      const result = await executeSql({
        conn,
        sql: sqlText,
        readOnly: true,
        statementTimeoutMs: REPORT_TIMEOUT_MS,
      });

      if (report.delivery === "email") {
        const rendered = renderQueryDigestEmail({
          reportName: report.name,
          connectionName: conn.name,
          connectionId: conn.id,
          rowCount: result.rowCount,
          truncated: result.truncated,
          tableHtml: resultToHtmlTable(result),
        });
        const sent = await sendEmail({
          to: report.target,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          tag: "query_digest",
        });
        await markReportRun(report.id, sent.delivered ? "sent" : (sent.reason ?? "failed"), sent.error ?? null);
        results.push({ reportId: report.id, status: sent.delivered ? "sent" : (sent.reason ?? "failed") });
      } else {
        // webhook: re-validate at fire time, POST the result as JSON.
        try {
          validateWebhookUrl(report.target);
        } catch {
          await markReportRun(report.id, "failed", "webhook URL failed validation");
          results.push({ reportId: report.id, status: "failed" });
          continue;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5_000);
        try {
          const res = await fetch(report.target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              report: report.name,
              connection: conn.name,
              columns: result.columns.map((c) => c.name),
              rows: result.rows,
              rowCount: result.rowCount,
              truncated: result.truncated,
            }),
            signal: controller.signal,
          });
          await markReportRun(report.id, res.ok ? "sent" : `http_${res.status}`, res.ok ? null : `webhook ${res.status}`);
          results.push({ reportId: report.id, status: res.ok ? "sent" : `http_${res.status}` });
        } finally {
          clearTimeout(timer);
        }
      }
    } catch (e) {
      const message = redact((e as Error).message ?? "Report failed.");
      log.warn("scheduled report failed", { reportId: report.id, err: message });
      await markReportRun(report.id, "failed", message);
      results.push({ reportId: report.id, status: "failed", error: message });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}

export async function GET() {
  const configured = !!process.env.CRON_SECRET?.trim();
  return NextResponse.json({
    configured,
    message: configured
      ? "POST with Bearer auth to run due scheduled reports."
      : "Set CRON_SECRET to enable scheduled reports.",
  });
}
