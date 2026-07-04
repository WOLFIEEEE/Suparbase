import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { computeColumnStats } from "@/server/insights/column-stats";
import { SqlExecutionError } from "@/server/proxy/sql-playground";
import { NoPostgresUrlError } from "@/server/proxy/postgres";
import { checkReadRate } from "@/server/proxy/ratelimit";
import { redact } from "@/lib/redact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const BodySchema = z.object({
  schema: z.string().trim().min(1).max(128),
  table: z.string().trim().min(1).max(128),
  column: z.string().trim().min(1).max(128),
});

/** POST /api/v/[id]/column-stats — read-only aggregate stats for one column. */
export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  if (!conn.encryptedPostgresUrl) {
    return NextResponse.json(
      { category: "no_postgres_url", message: "Column insights need the Direct Postgres URL." },
      { status: 400 },
    );
  }

  const rate = checkReadRate(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ category: "validation", message: "Invalid body." }, { status: 400 });
  }

  try {
    const stats = await computeColumnStats(conn, parsed.data.schema, parsed.data.table, parsed.data.column);
    return NextResponse.json({ stats });
  } catch (e) {
    if (e instanceof NoPostgresUrlError) {
      return NextResponse.json({ category: "no_postgres_url", message: e.message }, { status: 400 });
    }
    if (e instanceof SqlExecutionError) {
      return NextResponse.json({ category: e.category, message: redact(e.message) }, { status: 400 });
    }
    return NextResponse.json(
      { category: "server", message: redact((e as Error).message ?? "Failed to compute stats.") },
      { status: 500 },
    );
  }
}
