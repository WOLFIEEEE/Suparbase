import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { undoSession } from "@/server/sentry/undo";
import { checkAiRate } from "@/server/proxy/ratelimit";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string; sessionId: string }>;
}

export async function POST(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, sessionId } = await ctx.params;
  // Destructive: re-runs the audit log in reverse. Viewers can read the
  // session timeline but cannot mutate the database from it.
  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to undo sessions." },
      { status: 403 },
    );
  }
  // Undo runs a multi-statement transaction. Hammer-protection on the
  // AI bucket which is the right shape for this load class.
  const limit = checkAiRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many undo attempts, try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  try {
    const result = await undoSession(session.user.id, access.conn, sessionId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AppError) {
      const status =
        e.category === "no_postgres_url"
          ? 400
          : e.category === "not_found"
          ? 404
          : e.category === "validation"
          ? 400
          : 500;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Undo failed." },
      { status: 500 },
    );
  }
}
