import { NextResponse } from "next/server";
import { sql as drizzleSql } from "drizzle-orm";
import { db } from "@/server/db";
import { isEmailConfigured } from "@/server/email/resend";
import { isBillingConfigured } from "@/server/billing/dodo";
import { hasErrorReporter } from "@/server/observability/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight readiness check. Hit from UptimeRobot / Coolify
 * health probes / `curl` after deploy. The response shape lets the
 * operator confirm wiring at a glance — db reachable, email +
 * billing + observability configured.
 *
 * Returns 503 only when the database is unreachable (the one
 * dependency that must work for anything else to). Missing optional
 * integrations (email, billing, sentry) report `false` but keep the
 * overall status `ok`.
 */
export async function GET() {
  let dbOk = false;
  try {
    await db.execute(drizzleSql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const body = {
    status: dbOk ? "ok" : "degraded",
    db: dbOk,
    email: isEmailConfigured(),
    billing: isBillingConfigured(),
    observability: hasErrorReporter(),
    version: process.env.npm_package_version ?? null,
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
