import "server-only";
import { redact } from "@/lib/redact";
import { log } from "@/server/log";
import { validateWebhookUrl } from "@/server/actions/repo";
import type { ConnectionRow } from "@/server/schema/connections";
import type { FindingSeverity } from "@/server/schema/sentry";

export interface AlertFinding {
  kind: string;
  severity: FindingSeverity;
  schemaName: string | null;
  tableName: string | null;
  columnName: string | null;
}

const ALERT_TIMEOUT_MS = 5_000;

/**
 * Notify the connection's alert webhook about NEW critical findings from
 * a just-finished Sentry scan. Fire-and-forget: a dead webhook must never
 * fail the scan. The payload carries a `text` field so a Slack / Discord
 * incoming webhook renders it without any configuration, plus structured
 * `findings` for machine consumers. The URL is re-validated against the
 * SSRF blocklist at fire time, not just at save time.
 */
export async function sendSentryAlert(
  conn: ConnectionRow,
  siteUrl: string,
  findings: AlertFinding[],
): Promise<void> {
  const url = conn.alertWebhookUrl;
  if (!url || findings.length === 0) return;
  try {
    validateWebhookUrl(url);
  } catch {
    log.warn("sentry alert skipped: webhook URL failed fire-time validation", {
      connectionId: conn.id,
    });
    return;
  }

  const lines = findings
    .slice(0, 10)
    .map((f) => `• [${f.severity}] ${f.kind} on ${f.schemaName ?? "?"}.${f.tableName ?? "?"}`);
  if (findings.length > 10) lines.push(`… and ${findings.length - 10} more`);
  const text = [
    `🚨 Suparbase Sentry: ${findings.length} new critical finding${findings.length === 1 ? "" : "s"} on "${conn.name}"`,
    ...lines,
    `${siteUrl.replace(/\/$/, "")}/c/${conn.id}/sentry`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        connection: conn.name,
        connectionId: conn.id,
        findings,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn("sentry alert webhook answered non-2xx", {
        connectionId: conn.id,
        status: res.status,
      });
    }
  } catch (e) {
    log.warn("sentry alert webhook failed", {
      connectionId: conn.id,
      err: redact((e as Error).message ?? "unknown"),
    });
  } finally {
    clearTimeout(timer);
  }
}
