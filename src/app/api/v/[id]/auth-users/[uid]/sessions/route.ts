import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { listSessions, revokeAllSessions } from "@/server/impersonation/repo";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; uid: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, uid } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "viewer");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    const sessions = await listSessions(conn, uid);
    return NextResponse.json({ sessions });
  } catch (e) {
    return errResp(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, uid } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "owner");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    const count = await revokeAllSessions(conn, uid);
    return NextResponse.json({ revoked: count });
  } catch (e) {
    return errResp(e);
  }
}

function errResp(e: unknown): NextResponse {
  if (e instanceof AppError) {
    const status = e.category === "unauthorized" ? 403 : e.category === "validation" ? 400 : 500;
    return NextResponse.json({ category: e.category, message: e.message }, { status });
  }
  return NextResponse.json(
    { category: "server", message: (e as Error).message ?? "Sessions call failed." },
    { status: 500 },
  );
}
