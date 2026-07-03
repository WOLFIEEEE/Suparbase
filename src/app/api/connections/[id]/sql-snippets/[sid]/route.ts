import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { sqlSnippets } from "@/server/schema";
import { getConnectionAccess } from "@/server/connections/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; sid: string }>;
}

/** DELETE /api/connections/[id]/sql-snippets/[sid] — delete one of your snippets. */
export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, sid } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) {
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const rows = await db
    .delete(sqlSnippets)
    .where(
      and(
        eq(sqlSnippets.id, sid),
        eq(sqlSnippets.userId, session.user.id),
        eq(sqlSnippets.connectionId, id),
      ),
    )
    .returning({ id: sqlSnippets.id });
  if (rows.length === 0) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
