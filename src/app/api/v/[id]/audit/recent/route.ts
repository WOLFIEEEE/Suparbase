import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { fetchRecentAudit } from "@/server/audit/recent";
import { checkReadRate } from "@/server/proxy/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { category: "unauthorized", message: "Not signed in." },
      { status: 401, headers: HEADERS },
    );
  }
  const { id } = await ctx.params;

  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) {
    return NextResponse.json(
      { category: "not_found", message: "Connection not found." },
      { status: 404, headers: HEADERS },
    );
  }

  const rate = checkReadRate(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: `Too many requests. Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.trunc(limitParam) : 10;

  try {
    const rows = await fetchRecentAudit(session.user.id, conn.id, limit);
    return NextResponse.json(
      {
        entries: rows.map((r) => ({
          id: r.id,
          verb: r.verb,
          tableSchema: r.schemaName,
          tableName: r.tableName,
          primaryKey: r.primaryKey,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      { status: 200, headers: HEADERS },
    );
  } catch {
    return NextResponse.json(
      { category: "server", message: "Could not load audit log." },
      { status: 500, headers: HEADERS },
    );
  }
}
