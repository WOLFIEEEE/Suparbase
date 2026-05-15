import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { removeMember, updateMemberRole } from "@/server/team/repo";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});

interface Params {
  params: Promise<{ id: string; memberId: string }>;
}

export async function PATCH(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, memberId } = await ctx.params;
  const access = await requireRole(session.user.id, id, "owner");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Only the connection owner can change member roles." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: "Role must be editor or viewer." },
      { status: 400 },
    );
  }
  const member = await updateMemberRole(id, memberId, parsed.data.role);
  if (!member) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json(member);
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, memberId } = await ctx.params;
  const access = await requireRole(session.user.id, id, "owner");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Only the connection owner can remove members." },
      { status: 403 },
    );
  }
  const ok = await removeMember(id, memberId);
  if (!ok) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
