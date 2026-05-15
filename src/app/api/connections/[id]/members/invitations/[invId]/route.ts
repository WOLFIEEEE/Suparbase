import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { revokeInvitation } from "@/server/team/repo";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; invId: string }>;
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, invId } = await ctx.params;
  const access = await requireRole(session.user.id, id, "owner");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Only the connection owner can revoke invites." },
      { status: 403 },
    );
  }
  const ok = await revokeInvitation(id, invId);
  if (!ok) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
