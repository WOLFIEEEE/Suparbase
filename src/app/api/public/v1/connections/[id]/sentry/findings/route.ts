import { NextResponse, type NextRequest } from "next/server";
import { requireApiToken } from "@/server/api-tokens/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { listFindings, listRecentScans } from "@/server/sentry/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/** GET /api/public/v1/connections/:id/sentry/findings — findings + recent scans. */
export async function GET(req: NextRequest, ctx: Params) {
  const gate = await requireApiToken(req);
  if ("response" in gate) return gate.response;
  const { id } = await ctx.params;
  const access = await getConnectionAccess(gate.principal.userId, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const [findings, scans] = await Promise.all([listFindings(id), listRecentScans(id)]);
  return NextResponse.json({ findings, scans });
}
