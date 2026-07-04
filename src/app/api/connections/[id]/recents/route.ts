import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { listRecents, recordRecent } from "@/server/prefs/repo";

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
  const recents = await listRecents(session.user.id, id);
  return NextResponse.json({ recents });
}

const RecordSchema = z.object({
  tableName: z.string().trim().min(1).max(200),
  primaryKey: z.record(z.string(), z.unknown()),
  label: z.string().trim().min(1).max(200),
});

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const parsed = RecordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ category: "validation", message: "Invalid body." }, { status: 400 });
  }
  await recordRecent({
    userId: session.user.id,
    connectionId: id,
    tableName: parsed.data.tableName,
    primaryKey: parsed.data.primaryKey,
    label: parsed.data.label,
  });
  return NextResponse.json({ ok: true });
}
