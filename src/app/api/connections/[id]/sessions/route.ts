import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { listSessions } from "@/server/sentry/sessions";

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
  const sessions = await listSessions(id);
  return NextResponse.json({
    sessions,
    canUndo: !!access.conn.encryptedPostgresUrl,
    myRole: access.role,
  });
}
