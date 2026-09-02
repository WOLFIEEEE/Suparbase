import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { deleteNote } from "@/server/notes/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; nid: string }>;
}

/** DELETE — authors remove their own notes; owners can remove any. */
export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, nid } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const ok = await deleteNote(id, nid, access.role === "owner" ? {} : { authorId: session.user.id });
  if (!ok) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
