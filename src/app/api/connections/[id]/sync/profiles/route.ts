import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess, getConnectionForRole, requireRole } from "@/server/connections/repo";
import { createProfile, listProfiles } from "@/server/sync/repo";
import { createProfileSchema } from "@/server/sync/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const profiles = await listProfiles(session.user.id, id);
  return NextResponse.json({
    profiles,
    targetHasPostgresUrl: !!access.conn.encryptedPostgresUrl,
    myRole: access.role,
  });
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const access = await requireRole(session.user.id, id, "owner");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required." },
      { status: 403 },
    );
  }

  const parsed = createProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const body = parsed.data;

  if (body.baseConnectionId === id) {
    return NextResponse.json(
      { category: "validation", message: "Base and target must differ." },
      { status: 400 },
    );
  }
  const base = await getConnectionForRole(session.user.id, body.baseConnectionId, "viewer");
  if (!base) {
    return NextResponse.json(
      { category: "validation", message: "Base connection not found or not accessible." },
      { status: 400 },
    );
  }
  if (!base.encryptedPostgresUrl || !access.conn.encryptedPostgresUrl) {
    return NextResponse.json(
      {
        category: "no_postgres_url",
        message: "Both base and target need a Direct Postgres URL for sync.",
      },
      { status: 400 },
    );
  }

  try {
    const profile = await createProfile({
      userId: session.user.id,
      name: body.name,
      baseConnectionId: body.baseConnectionId,
      targetConnectionId: id,
      options: body.options,
      tableConfig: body.tableConfig,
      scheduleIntervalHours: body.scheduleIntervalHours ?? null,
    });
    return NextResponse.json({ profile }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("sync_profile_user_name_unique")) {
      return NextResponse.json(
        { category: "validation", message: "You already have a sync profile with that name." },
        { status: 409 },
      );
    }
    return NextResponse.json({ category: "server", message: "Could not create profile." }, { status: 500 });
  }
}
