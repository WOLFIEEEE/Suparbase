import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { listFindings, listRecentScans } from "@/server/sentry/repo";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const [findings, scans] = await Promise.all([
    listFindings(session.user.id, id),
    listRecentScans(session.user.id, id),
  ]);
  return NextResponse.json({
    findings,
    scans,
    canQuarantine: !!conn.encryptedPostgresUrl,
  });
}
