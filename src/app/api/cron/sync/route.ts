import { NextResponse, type NextRequest } from "next/server";
import { redact } from "@/lib/redact";
import { getConnectionForUser } from "@/server/connections/repo";
import { verifyCronAuth } from "@/server/security/cron-auth";
import {
  createRun,
  hasRecentRunningRun,
  listDueProfiles,
  markScheduledRun,
  updateRun,
} from "@/server/sync/repo";
import { executeSyncRun } from "@/server/sync/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Runs every scheduled sync profile whose interval has elapsed. Triggered by
 * an external scheduler (same Bearer-CRON_SECRET contract as retention).
 * Scheduled runs skip the typed-name confirmation — enabling the schedule is
 * the consent — and are always real (non-dry) full-replace runs.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { category: "no_key", message: "CRON_SECRET is not configured; scheduled sync is disabled." },
      { status: 503 },
    );
  }
  if (!verifyCronAuth(req.headers.get("authorization"), secret)) {
    return NextResponse.json(
      { category: "unauthorized", message: "Bad or missing Authorization." },
      { status: 401 },
    );
  }

  const due = await listDueProfiles();
  const results: Array<{ profileId: string; status: string; error?: string }> = [];

  for (const profile of due) {
    // Skip while a sync against the same target is still running (a run can
    // outlast the schedule interval). Without this the new run would only
    // die noisily against the target advisory lock. The staleness cutoff in
    // hasRecentRunningRun stops a crashed run from wedging the schedule.
    if (await hasRecentRunningRun(profile.userId, profile.targetConnectionId)) {
      results.push({ profileId: profile.id, status: "skipped", error: "a sync to this target is still running" });
      continue;
    }

    // Mark first so a persistently-failing profile retries on its interval,
    // not on every cron tick.
    await markScheduledRun(profile.id);

    const base = await getConnectionForUser(profile.userId, profile.baseConnectionId);
    const target = await getConnectionForUser(profile.userId, profile.targetConnectionId);
    if (!base || !target || !base.encryptedPostgresUrl || !target.encryptedPostgresUrl) {
      results.push({ profileId: profile.id, status: "skipped", error: "missing connection or Postgres URL" });
      continue;
    }

    const run = await createRun({
      userId: profile.userId,
      profileId: profile.id,
      baseConnectionId: profile.baseConnectionId,
      targetConnectionId: profile.targetConnectionId,
      dryRun: false,
    });

    try {
      const result = await executeSyncRun({
        base,
        target,
        tableConfig: profile.tableConfig,
        options: profile.options,
        dryRun: false,
      });
      await updateRun(profile.userId, run.id, {
        status: result.status,
        phase: "done",
        stats: result.stats,
        error: result.error ?? null,
        finishedAt: new Date(),
      });
      results.push({ profileId: profile.id, status: result.status, error: result.error });
    } catch (e) {
      // Driver errors can embed the connection URL — never store it raw.
      const message = redact((e as Error).message ?? "Sync failed.");
      await updateRun(profile.userId, run.id, {
        status: "failed",
        error: message,
        finishedAt: new Date(),
      });
      results.push({ profileId: profile.id, status: "failed", error: message });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}

export async function GET() {
  const configured = !!process.env.CRON_SECRET?.trim();
  return NextResponse.json({
    configured,
    message: configured
      ? "POST with Bearer auth to run due scheduled syncs."
      : "Set CRON_SECRET to enable scheduled sync.",
  });
}
