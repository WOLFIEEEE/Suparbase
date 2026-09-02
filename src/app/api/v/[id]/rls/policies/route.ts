import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { listPolicies, listRlsStatus, NoPostgresUrlError } from "@/server/proxy/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "viewer");
  if (!conn) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }
  try {
    const [policies, status] = await Promise.all([listPolicies(conn), listRlsStatus(conn)]);
    return NextResponse.json({ policies, status });
  } catch (e) {
    if (e instanceof NoPostgresUrlError) {
      return NextResponse.json(
        { category: "no_postgres_url", message: e.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Failed to load policies." },
      { status: 500 },
    );
  }
}
