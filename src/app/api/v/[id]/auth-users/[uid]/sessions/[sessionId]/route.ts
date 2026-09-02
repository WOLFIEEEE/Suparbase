import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { revokeSession } from "@/server/impersonation/repo";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; uid: string; sessionId: string }>;
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, sessionId } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "owner");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    await revokeSession(conn, sessionId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.category === "unauthorized" ? 403 : e.category === "validation" ? 400 : 500;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Revoke failed." },
      { status: 500 },
    );
  }
}
