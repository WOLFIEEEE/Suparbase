import { NextResponse, type NextRequest } from "next/server";
import { requireApiToken } from "@/server/api-tokens/auth";
import { listConnections } from "@/server/connections/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/public/v1/connections — every connection the token owner can access. */
export async function GET(req: NextRequest) {
  const gate = await requireApiToken(req);
  if ("response" in gate) return gate.response;
  const rows = await listConnections(gate.principal.userId);
  return NextResponse.json({
    connections: rows.map((c) => ({
      id: c.id,
      name: c.name,
      hostname: c.hostname,
      url: c.url,
      keyRole: c.role,
      environment: c.environment,
      myRole: c.myRole ?? "owner",
      hasPostgresUrl: c.hasPostgresUrl,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    })),
  });
}
