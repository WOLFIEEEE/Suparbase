import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { getAction } from "@/server/actions/repo";
import { runAction } from "@/server/actions/execute";
import { checkAiRate } from "@/server/proxy/ratelimit";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ExecSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  primaryKey: z.record(z.string(), z.unknown()).optional(),
});

interface Params {
  params: Promise<{ id: string; actionId: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, actionId } = await ctx.params;

  // Action execution runs arbitrary SQL or fires a webhook against the
  // project, same blast as a manual SQL playground query. Editor+ only.
  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to run actions." },
      { status: 403 },
    );
  }
  const conn = access.conn;

  const action = await getAction(session.user.id, id, actionId);
  if (!action) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const limit = checkAiRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many actions: try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = ExecSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: "Invalid execution body." },
      { status: 400 },
    );
  }

  if (action.scope === "row" && !parsed.data.primaryKey) {
    return NextResponse.json(
      { category: "validation", message: "Row-scoped actions require a primaryKey." },
      { status: 400 },
    );
  }

  try {
    const result = await runAction({
      action,
      conn,
      params: parsed.data.params ?? {},
      primaryKey: parsed.data.primaryKey,
    });
    return NextResponse.json({ action: { id: action.id, name: action.name }, result });
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.category === "validation" ? 400 : e.category === "rls" ? 403 : 500;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Action failed." },
      { status: 500 },
    );
  }
}
