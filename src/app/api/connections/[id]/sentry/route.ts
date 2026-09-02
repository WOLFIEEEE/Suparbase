import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { listFindings, listRecentScans } from "@/server/sentry/repo";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const [findings, scans] = await Promise.all([
    listFindings(id),
    listRecentScans(id),
  ]);
  return NextResponse.json({
    findings,
    scans,
    canQuarantine: !!access.conn.encryptedPostgresUrl,
    myRole: access.role,
  });
}
