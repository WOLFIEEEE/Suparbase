import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { loadCachedAnalysis, runOrLoadAnalysis } from "@/server/ai/analyze";
import { OpenRouterError } from "@/server/ai/openrouter";
import { checkAiRate } from "@/server/proxy/ratelimit";
import { IntrospectionError } from "@/server/schema-introspect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "viewer");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  try {
    const result = await loadCachedAnalysis(session.user.id, id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof IntrospectionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 502 });
    }
    return NextResponse.json({ category: "server", message: "Failed to load analysis." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "editor");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });

  let body: { force?: boolean } = {};
  try {
    if (req.headers.get("content-length") !== "0") body = (await req.json()) as { force?: boolean };
  } catch {
    /* empty body is fine */
  }

  const limit = checkAiRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many analyses: try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await runOrLoadAnalysis(session.user.id, id, { force: !!body.force });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OpenRouterError) {
      const status = e.category === "unauthorized" ? 400 : 502;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    if (e instanceof IntrospectionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { category: "server", message: "Analysis failed." },
      { status: 500 },
    );
  }
}
