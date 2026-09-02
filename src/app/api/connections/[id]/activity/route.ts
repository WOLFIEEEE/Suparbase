import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { fetchActivity } from "@/server/audit/activity";
import { checkReadRate } from "@/server/proxy/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/connections/[id]/activity — connection-level audit timeline,
 * newest first, filterable by verb/table and keyset-paginated via `before`.
 */
export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const rate = checkReadRate(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const url = new URL(req.url);
  const verbParam = url.searchParams.get("verb");
  const verb =
    verbParam === "insert" || verbParam === "update" || verbParam === "delete" ? verbParam : undefined;
  const table = url.searchParams.get("table") || undefined;
  const before = url.searchParams.get("before") || undefined;
  const limit = Number(url.searchParams.get("limit")) || 50;

  const entries = await fetchActivity(id, { verb, table, before, limit });
  return NextResponse.json({ entries });
}
