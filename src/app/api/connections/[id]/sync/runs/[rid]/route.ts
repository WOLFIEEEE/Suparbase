import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { getRun } from "@/server/sync/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; rid: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, rid } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const run = await getRun(session.user.id, rid);
  if (!run || run.targetConnectionId !== id) {
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ run });
}
