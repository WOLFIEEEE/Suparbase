import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized", message: "Not signed in." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }
  try {
    const schema = await introspectConnection(conn);
    return NextResponse.json({ schema });
  } catch (e) {
    if (e instanceof IntrospectionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: e.category === "unauthorized" ? 401 : 502 });
    }
    return NextResponse.json({ category: "server", message: "Introspection failed." }, { status: 500 });
  }
}
