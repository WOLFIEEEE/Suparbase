import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { dismissQuarantine, quarantineFinding } from "@/server/sentry/quarantine";
import { checkWriteRate } from "@/server/proxy/ratelimit";
import { AppError } from "@/lib/errors";

function rateLimitOr429(userId: string) {
  const limit = checkWriteRate(userId);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many quarantine actions, try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  return null;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; findingId: string }>;
}

export async function POST(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, findingId } = await ctx.params;
  // Quarantine writes DDL + CREATE POLICY to the project database.
  // Owner or editor only.
  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to quarantine." },
      { status: 403 },
    );
  }
  const rate = rateLimitOr429(session.user.id);
  if (rate) return rate;
  try {
    await quarantineFinding(session.user.id, access.conn, findingId);
    return NextResponse.json({ ok: true });
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
      { category: "server", message: (e as Error).message ?? "Quarantine failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, findingId } = await ctx.params;
  // Dismissing quarantine drops the deny-all policy, same blast as
  // applying it, gate the same.
  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to dismiss quarantine." },
      { status: 403 },
    );
  }
  const rate = rateLimitOr429(session.user.id);
  if (rate) return rate;
  try {
    await dismissQuarantine(session.user.id, access.conn, findingId);
    return NextResponse.json({ ok: true });
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
      { category: "server", message: (e as Error).message ?? "Dismiss failed." },
      { status: 500 },
    );
  }
}
