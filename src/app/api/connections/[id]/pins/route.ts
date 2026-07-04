import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { listPins, togglePin } from "@/server/prefs/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const pins = await listPins(session.user.id, id);
  return NextResponse.json({ pins });
}

const ToggleSchema = z.object({ tableName: z.string().trim().min(1).max(200) });

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const parsed = ToggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ category: "validation", message: "Invalid body." }, { status: 400 });
  }
  const pinned = await togglePin(session.user.id, id, parsed.data.tableName);
  return NextResponse.json({ pinned });
}
