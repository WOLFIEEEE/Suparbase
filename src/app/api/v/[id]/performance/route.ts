import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { collectPerformance } from "@/server/insights/performance";
import { NoPostgresUrlError } from "@/server/proxy/postgres";
import { limitOr429 } from "@/server/security/route-guards";
import { redact } from "@/lib/redact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/v/[id]/performance — pg_stat_* health report + advisor output. */
export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const limited = limitOr429(session.user.id, "read");
  if (limited) return limited;

  try {
    const report = await collectPerformance(access.conn);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NoPostgresUrlError) {
      return NextResponse.json(
        { category: "no_postgres_url", message: "Add the Direct Postgres URL on connection settings to see performance statistics." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { category: "server", message: redact((e as Error).message ?? "Could not collect statistics.") },
      { status: 502 },
    );
  }
}
