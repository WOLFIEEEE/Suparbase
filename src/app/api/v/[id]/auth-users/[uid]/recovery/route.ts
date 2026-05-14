import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { AuthAdminError, generateRecoveryLink, getUser } from "@/server/proxy/auth-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; uid: string }>;
}

export async function POST(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, uid } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    const user = await getUser(conn, uid);
    if (!user.email) {
      return NextResponse.json(
        { category: "validation", message: "User has no email: recovery requires one." },
        { status: 400 },
      );
    }
    const link = await generateRecoveryLink(conn, user.email);
    return NextResponse.json(link);
  } catch (e) {
    if (e instanceof AuthAdminError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Recovery failed." },
      { status: 500 },
    );
  }
}
