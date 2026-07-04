import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { deleteReport, setReportEnabled } from "@/server/reports/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; rid: string }>;
}

const PatchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, rid } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ category: "validation", message: "Invalid body." }, { status: 400 });
  }
  const ok = await setReportEnabled(session.user.id, rid, parsed.data.enabled);
  if (!ok) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, rid } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const ok = await deleteReport(session.user.id, rid);
  if (!ok) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
