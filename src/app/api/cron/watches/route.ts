import { NextResponse, type NextRequest } from "next/server";
import { redact } from "@/lib/redact";
import { getConnectionForUser } from "@/server/connections/repo";
import { verifyCronAuth } from "@/server/security/cron-auth";
import { executeSql } from "@/server/proxy/sql-playground";
import { listDueWatches, recordWatchCheck } from "@/server/watches/repo";
import { sendWatchAlert } from "@/server/watches/alert";
import { notifyConnection } from "@/server/notifications/repo";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const WATCH_TIMEOUT_MS = 15_000;

/**
 * Evaluates every due data watch: runs its SELECT read-only, and if the
 * match count has GROWN since the last check, fires a webhook alert
 * (debounced on the count so a persistently-true condition stays quiet).
 * Same Bearer-CRON_SECRET contract as the other cron routes.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { category: "no_key", message: "CRON_SECRET is not configured; data watches are disabled." },
      { status: 503 },
    );
  }
  if (!verifyCronAuth(req.headers.get("authorization"), secret)) {
    return NextResponse.json(
      { category: "unauthorized", message: "Bad or missing Authorization." },
      { status: 401 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://suparbase.com";
  const due = await listDueWatches();
  const results: Array<{ watchId: string; status: string; matches?: number }> = [];

  for (const watch of due) {
    try {
      const conn = await getConnectionForUser(watch.userId, watch.connectionId);
      if (!conn || !conn.encryptedPostgresUrl) {
        await recordWatchCheck(watch.id, watch.lastMatchCount, false, "missing connection or Postgres URL");
        results.push({ watchId: watch.id, status: "skipped" });
        continue;
      }

      const result = await executeSql({
        conn,
        sql: watch.sql,
        readOnly: true,
        statementTimeoutMs: WATCH_TIMEOUT_MS,
      });
      const matchCount = result.rowCount;
      // Alert only when matches GREW — a new failure appeared, not the
      // same known-bad rows on every tick.
      const grew = matchCount > watch.lastMatchCount;
      let alerted = false;
      if (grew) {
        alerted = await sendWatchAlert(watch, conn, siteUrl, matchCount, watch.lastMatchCount);
        void notifyConnection(conn.id, {
          kind: "watch_alert",
          title: `Watch "${watch.name}": ${matchCount} match${matchCount === 1 ? "" : "es"} (was ${watch.lastMatchCount})`,
          body: alerted ? "Webhook delivered." : "Webhook not delivered; see the watch for details.",
          href: `/c/${conn.id}/watches`,
        });
      }
      await recordWatchCheck(watch.id, matchCount, alerted, null);
      results.push({ watchId: watch.id, status: alerted ? "alerted" : "ok", matches: matchCount });
    } catch (e) {
      const message = redact((e as Error).message ?? "Watch failed.");
      log.warn("data watch failed", { watchId: watch.id, err: message });
      await recordWatchCheck(watch.id, watch.lastMatchCount, false, message);
      results.push({ watchId: watch.id, status: "failed" });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}

export async function GET() {
  const configured = !!process.env.CRON_SECRET?.trim();
  return NextResponse.json({
    configured,
    message: configured
      ? "POST with Bearer auth to evaluate due data watches."
      : "Set CRON_SECRET to enable data watches.",
  });
}
