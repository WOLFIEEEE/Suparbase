import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import {
  AuthAdminError,
  deleteUser,
  getUser,
  updateUser,
} from "@/server/proxy/auth-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; uid: string }>;
}

const PatchSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(6).optional(),
  userMetadata: z.record(z.unknown()).optional(),
  appMetadata: z.record(z.unknown()).optional(),
  /** ISO duration string or "none" to unban. */
  banDuration: z.string().optional(),
});

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, uid } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "viewer");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    const user = await getUser(conn, uid);
    return NextResponse.json(user);
  } catch (e) {
    return errResp(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, uid } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "owner");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Bad request body." },
      { status: 400 },
    );
  }
  try {
    const updated = await updateUser(conn, uid, body);
    return NextResponse.json(updated);
  } catch (e) {
    return errResp(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, uid } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "owner");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    await deleteUser(conn, uid);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errResp(e);
  }
}

function errResp(e: unknown): NextResponse {
  if (e instanceof AuthAdminError) {
    return NextResponse.json({ category: e.category, message: e.message }, { status: e.status });
  }
  return NextResponse.json(
    { category: "server", message: (e as Error).message ?? "Auth admin call failed." },
    { status: 500 },
  );
}
