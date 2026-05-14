import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import { searchRows } from "@/server/proxy/search";
import { checkReadRate } from "@/server/proxy/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  q: z.string().min(1).max(200),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }

  const limit = checkReadRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many searches: try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: { q: string };
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Bad request body." },
      { status: 400 },
    );
  }

  let schema;
  try {
    schema = await introspectConnection(conn);
  } catch (e) {
    if (e instanceof IntrospectionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 502 });
    }
    return NextResponse.json({ category: "server", message: "Failed to introspect schema." }, { status: 500 });
  }

  try {
    const hits = await searchRows({ conn, schema, query: body.q });
    return NextResponse.json({ hits });
  } catch (e) {
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Search failed." },
      { status: 500 },
    );
  }
}
