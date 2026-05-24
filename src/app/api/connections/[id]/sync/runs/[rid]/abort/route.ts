import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { getRun, updateRun } from "@/server/sync/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; rid: string }>;
}

/**
 * Cooperatively cancel a running sync. Sets the run's status to `aborted`;
 * the runner checks this between tables and rolls back the (still-open) data
 * transaction, leaving the target untouched. A no-op for runs that already
 * finished.
 */
export async function POST(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, rid } = await ctx.params;

  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required." },
      { status: 403 },
    );
  }

  const run = await getRun(session.user.id, rid);
  if (!run || run.targetConnectionId !== id) {
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }
  if (run.status !== "running") {
    return NextResponse.json({ ok: true, status: run.status, alreadyFinished: true });
  }

  await updateRun(session.user.id, rid, { status: "aborted" });
  return NextResponse.json({ ok: true, status: "aborted" });
}
