import "server-only";
import { redact } from "@/lib/redact";
import { log } from "@/server/log";
import { validateWebhookUrl } from "@/server/actions/repo";
import { hardenedFetch } from "@/server/security/egress";
import type { ConnectionRow } from "@/server/schema/connections";
import type { DataWatchRow } from "@/server/schema/data-watches";

const TIMEOUT_MS = 5_000;

/**
 * Fire a data-watch alert to its webhook (or the connection's alert
 * webhook fallback). Slack/Discord compatible via the `text` field.
 * Fire-and-forget; re-validates the URL at fire time.
 */
export async function sendWatchAlert(
  watch: DataWatchRow,
  conn: ConnectionRow,
  siteUrl: string,
  matchCount: number,
  previousCount: number,
): Promise<boolean> {
  const url = watch.webhookUrl ?? conn.alertWebhookUrl;
  if (!url) return false;
  try {
    validateWebhookUrl(url);
  } catch {
    log.warn("watch alert skipped: webhook URL failed fire-time validation", { watchId: watch.id });
    return false;
  }

  const text = [
    `👀 Suparbase watch "${watch.name}" on ${conn.name}: ${matchCount} match${matchCount === 1 ? "" : "es"} (was ${previousCount})`,
    `${siteUrl.replace(/\/$/, "")}/c/${conn.id}/watches`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await hardenedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        watch: watch.name,
        watchId: watch.id,
        connection: conn.name,
        connectionId: conn.id,
        matchCount,
        previousCount,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn("watch alert webhook non-2xx", { watchId: watch.id, status: res.status });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("watch alert webhook failed", { watchId: watch.id, err: redact((e as Error).message ?? "unknown") });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
