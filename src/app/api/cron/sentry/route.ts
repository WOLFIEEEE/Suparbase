import { NextResponse, type NextRequest } from "next/server";
import { redact } from "@/lib/redact";
import { verifyCronAuth } from "@/server/security/cron-auth";
import { listDueSentryConnections, markAutoScan } from "@/server/sentry/schedule";
import { runSentryScan } from "@/server/sentry/probe";
import { notifyConnection } from "@/server/notifications/repo";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Scheduled Sentry scans. Re-scans every connection whose owner enabled a
 * cadence and whose interval has elapsed. New critical findings notify the
 * alert webhook + in-app inbox through the same path a manual scan uses.
 * Same Bearer-CRON_SECRET contract as the other cron routes.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { category: "no_key", message: "CRON_SECRET is not configured; scheduled Sentry scans are disabled." },
      { status: 503 },
    );
  }
  if (!verifyCronAuth(req.headers.get("authorization"), secret)) {
    return NextResponse.json(
      { category: "unauthorized", message: "Bad or missing Authorization." },
      { status: 401 },
    );
  }

  const due = await listDueSentryConnections();
  const results: Array<{ connectionId: string; status: string; findings?: number }> = [];

  for (const conn of due) {
    // Stamp first so a crashed scan can't wedge the schedule into a hot loop.
    await markAutoScan(conn.id);
    try {
      const result = await runSentryScan(conn.userId, conn);
      results.push({ connectionId: conn.id, status: "ok", findings: result.findings });
    } catch (e) {
      const message = redact((e as Error).message ?? "Scan failed.");
      log.warn("scheduled sentry scan failed", { connectionId: conn.id, err: message });
      void notifyConnection(conn.id, {
        kind: "sentry_scan",
        title: `Scheduled Sentry scan failed on ${conn.name}`,
        body: message,
        href: `/c/${conn.id}/sentry`,
      });
      results.push({ connectionId: conn.id, status: "failed" });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}

export async function GET() {
  const configured = !!process.env.CRON_SECRET?.trim();
  return NextResponse.json({
    configured,
    message: configured
      ? "POST with Bearer auth to run due scheduled Sentry scans."
      : "Set CRON_SECRET to enable scheduled Sentry scans.",
  });
}
