import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { checkConnectionHealth } from "@/server/connections/health";
import { checkReadRate } from "@/server/proxy/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/connections/[id]/health — live reachability probe (REST +
 * direct Postgres) plus Sentry staleness for the health card. Read-only;
 * rate-limited with the read bucket since each call opens a PG session.
 */
export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const limit = checkReadRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const health = await checkConnectionHealth(session.user.id, conn);
  return NextResponse.json(health);
}
