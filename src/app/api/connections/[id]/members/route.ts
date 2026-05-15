import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { listMembers, listPendingInvitations } from "@/server/team/repo";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  // Anyone with access can see the team roster; only owner can mutate.
  const access = await requireRole(session.user.id, id, "viewer");
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const [members, invitations] = await Promise.all([
    listMembers(id),
    access.role === "owner" ? listPendingInvitations(id) : Promise.resolve([]),
  ]);
  return NextResponse.json({ members, invitations, myRole: access.role });
}
