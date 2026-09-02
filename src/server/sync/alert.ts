import "server-only";
import { redact } from "@/lib/redact";
import { log } from "@/server/log";
import { validateWebhookUrl } from "@/server/actions/repo";
import { hardenedFetch } from "@/server/security/egress";
import type { ConnectionRow } from "@/server/schema/connections";
import type { SyncRunStatus, SyncRunStats } from "@/server/schema/sync";

export interface SyncAlertInput {
  profileName: string;
  status: SyncRunStatus;
  stats: SyncRunStats;
  error?: string | null;
}

const ALERT_TIMEOUT_MS = 5_000;

/** Statuses worth alerting on. Successful scheduled runs stay quiet by design
 * (an hourly refresh shouldn't page anyone); only trouble notifies. */
const ALERTABLE: ReadonlySet<SyncRunStatus> = new Set(["failed", "partial", "aborted"]);

const STATUS_EMOJI: Record<SyncRunStatus, string> = {
  pending: "•",
  running: "•",
  succeeded: "✅",
  failed: "🔴",
  partial: "🟠",
  aborted: "⚪",
};

/**
 * Notify the target connection's alert webhook about a scheduled sync run that
 * needs attention (failed / partial / aborted). Fire-and-forget: a dead webhook
 * must never fail the sync. Same contract as the Sentry alert — a `text` field
 * so a Slack/Discord incoming webhook renders with no config, plus structured
 * fields for machine consumers. The URL is re-validated against the SSRF
 * blocklist at fire time.
 */
export async function sendSyncAlert(
  conn: ConnectionRow,
  siteUrl: string,
  input: SyncAlertInput,
): Promise<void> {
  const url = conn.alertWebhookUrl;
  if (!url || !ALERTABLE.has(input.status)) return;
  try {
    validateWebhookUrl(url);
  } catch {
    log.warn("sync alert skipped: webhook URL failed fire-time validation", {
      connectionId: conn.id,
    });
    return;
  }

  const rowsCopied = input.stats.tables.reduce((n, t) => n + t.rowsCopied, 0);
  const detail =
    input.status === "failed"
      ? input.error ?? "Sync failed."
      : input.status === "partial"
        ? `Completed with ${input.stats.warnings.length} warning(s); the target may not be an exact mirror.`
        : "The scheduled sync was aborted.";
  const text = [
    `${STATUS_EMOJI[input.status]} Suparbase sync ${input.status} — "${input.profileName}" → "${conn.name}"`,
    detail,
    `${input.stats.tables.length} table(s), ${rowsCopied.toLocaleString()} row(s) copied.`,
    `${siteUrl.replace(/\/$/, "")}/c/${conn.id}/sync`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  try {
    const res = await hardenedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        connection: conn.name,
        connectionId: conn.id,
        profile: input.profileName,
        status: input.status,
        tables: input.stats.tables.length,
        rowsCopied,
        warnings: input.stats.warnings,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn("sync alert webhook answered non-2xx", {
        connectionId: conn.id,
        status: res.status,
      });
    }
  } catch (e) {
    log.warn("sync alert webhook failed", {
      connectionId: conn.id,
      err: redact((e as Error).message ?? "unknown"),
    });
  } finally {
    clearTimeout(timer);
  }
}
