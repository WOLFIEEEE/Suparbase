import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { runSentryScan } from "@/server/sentry/probe";
import { checkAiRate } from "@/server/proxy/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "editor");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });

  // Sentry scans can be heavy (one HTTP round-trip per public table +
  // one pg_policies query). Rate-limit by the same bucket the AI uses.
  const limit = checkAiRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many scans: try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await runSentryScan(session.user.id, conn);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Scan failed." },
      { status: 500 },
    );
  }
}
