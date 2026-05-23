import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess, getConnectionForUser, requireRole } from "@/server/connections/repo";
import { deleteProfile, getProfile, updateProfile } from "@/server/sync/repo";
import { updateProfileSchema } from "@/server/sync/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; pid: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, pid } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const profile = await getProfile(session.user.id, pid);
  if (!profile || profile.targetConnectionId !== id) {
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ profile });
}

export async function PATCH(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, pid } = await ctx.params;

  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required." },
      { status: 403 },
    );
  }
  const existing = await getProfile(session.user.id, pid);
  if (!existing || existing.targetConnectionId !== id) {
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }

  const parsed = updateProfileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  if (patch.baseConnectionId) {
    if (patch.baseConnectionId === id) {
      return NextResponse.json(
        { category: "validation", message: "Base and target must differ." },
        { status: 400 },
      );
    }
    const base = await getConnectionForUser(session.user.id, patch.baseConnectionId);
    if (!base) {
      return NextResponse.json(
        { category: "validation", message: "Base connection not found or not accessible." },
        { status: 400 },
      );
    }
    if (!base.encryptedPostgresUrl) {
      return NextResponse.json(
        { category: "no_postgres_url", message: "Base connection needs a Direct Postgres URL." },
        { status: 400 },
      );
    }
  }

  try {
    const profile = await updateProfile(session.user.id, pid, patch);
    return NextResponse.json({ profile });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("sync_profile_user_name_unique")) {
      return NextResponse.json(
        { category: "validation", message: "You already have a sync profile with that name." },
        { status: 409 },
      );
    }
    return NextResponse.json({ category: "server", message: "Could not update profile." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, pid } = await ctx.params;

  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required." },
      { status: 403 },
    );
  }
  const existing = await getProfile(session.user.id, pid);
  if (!existing || existing.targetConnectionId !== id) {
    return NextResponse.json({ category: "not_found" }, { status: 404 });
  }
  await deleteProfile(session.user.id, pid);
  return NextResponse.json({ ok: true });
}
