import { NextResponse, type NextRequest } from "next/server";
import { requireApiToken } from "@/server/api-tokens/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { fetchActivity } from "@/server/audit/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/public/v1/connections/:id/activity?verb=&table=&before=&limit=
 * Audit timeline, newest first, keyset-paginated on `before` (ISO timestamp).
 */
export async function GET(req: NextRequest, ctx: Params) {
  const gate = await requireApiToken(req);
  if ("response" in gate) return gate.response;
  const { id } = await ctx.params;
  const access = await getConnectionAccess(gate.principal.userId, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const verbParam = sp.get("verb");
  const verb = verbParam === "insert" || verbParam === "update" || verbParam === "delete" ? verbParam : undefined;
  const entries = await fetchActivity(id, {
    verb,
    table: sp.get("table") || undefined,
    before: sp.get("before") || undefined,
    limit: Number(sp.get("limit")) || 50,
  });
  const nextBefore = entries.length > 0 ? entries[entries.length - 1]!.createdAt : null;
  return NextResponse.json({ entries, nextBefore });
}
