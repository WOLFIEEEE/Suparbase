import { NextResponse, type NextRequest } from "next/server";
import { runRetention } from "@/server/audit/retention";
import { executeScheduledDeletions } from "@/server/auth/delete-account";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Retention job. Trims audit_log, sentry_scan, sentry_finding, and
 * agent_session down to their configured retention windows.
 *
 * Auth model: a shared secret in the `Authorization: Bearer …` header.
 * The secret comes from the `CRON_SECRET` env var; if it's not set, the
 * endpoint refuses to run (so a fresh deployment without a configured
 * cron secret is fail-closed, not fail-open).
 *
 * Call this from any scheduler:
 *   - Coolify cron: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/retention`
 *   - Vercel cron: add to vercel.json or env-driven scheduler
 *   - cron-job.org / GitHub Actions: same shape
 *
 * Daily is the sensible cadence; hourly is fine but wasteful. The
 * handler is idempotent - running it twice does nothing extra.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        category: "no_key",
        message:
          "CRON_SECRET env var is not configured. Retention is disabled. Set CRON_SECRET to enable.",
      },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { category: "unauthorized", message: "Bad or missing Authorization." },
      { status: 401 },
    );
  }
  try {
    // Run scheduled-deletion BEFORE retention pruning so the cascade
    // deletes propagate cleanly: a user removed here loses their
    // cascade-attached rows, and the audit_log pruning that runs
    // next can then sweep older anonymised rows. Order matters only
    // for the user-facing optics; both are independently idempotent.
    const deletedAccounts = await executeScheduledDeletions();
    const result = await runRetention();
    return NextResponse.json({ ...result, accountsHardDeleted: deletedAccounts });
  } catch (e) {
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Retention failed." },
      { status: 500 },
    );
  }
}

/** GET returns a small status echo so a human can confirm the route works. */
export async function GET() {
  const configured = !!process.env.CRON_SECRET?.trim();
  return NextResponse.json({
    configured,
    message: configured
      ? "POST with Bearer auth to run retention."
      : "Set CRON_SECRET to enable retention.",
  });
}
