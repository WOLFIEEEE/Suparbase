import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionAccess, roleAtLeast } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import { listSnapshots, recordSnapshot } from "@/server/snapshots/repo";
import { limitOr429 } from "@/server/security/route-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET: newest-first list of schema snapshots (no column payload). */
export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const snapshots = await listSnapshots(id);
  return NextResponse.json({ snapshots });
}

const CreateSchema = z.object({
  label: z.string().trim().max(80).optional(),
});

/** POST: introspect now and store a manual snapshot (editor+). */
export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  if (!roleAtLeast(access.role, "editor")) {
    return NextResponse.json({ category: "forbidden", message: "Editor access is required." }, { status: 403 });
  }
  const limited = limitOr429(session.user.id, "write");
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ category: "validation", message: "Invalid body." }, { status: 400 });
  }

  try {
    const schema = await introspectConnection(access.conn);
    const result = await recordSnapshot(id, schema, {
      source: "manual",
      createdBy: session.user.id,
      label: parsed.data.label || null,
      force: true,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof IntrospectionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 502 });
    }
    return NextResponse.json({ category: "server", message: "Snapshot failed." }, { status: 500 });
  }
}
