import { NextResponse, type NextRequest } from "next/server";
import { requireApiToken } from "@/server/api-tokens/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import { toSnapshotTables } from "@/lib/schema-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/public/v1/connections/:id/schema — live introspected schema (compact shape). */
export async function GET(req: NextRequest, ctx: Params) {
  const gate = await requireApiToken(req);
  if ("response" in gate) return gate.response;
  const { id } = await ctx.params;
  const access = await getConnectionAccess(gate.principal.userId, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    const schema = await introspectConnection(access.conn);
    return NextResponse.json({
      hostname: schema.hostname,
      introspectedAt: new Date(schema.introspectedAt).toISOString(),
      tables: toSnapshotTables(schema),
    });
  } catch (e) {
    if (e instanceof IntrospectionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 502 });
    }
    return NextResponse.json({ category: "server", message: "Introspection failed." }, { status: 500 });
  }
}
