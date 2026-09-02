import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { listConnections } from "@/server/connections/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/connections/export — JSON manifest of the caller's connections
 * WITHOUT any secret. Re-import it on another account / instance via
 * /connections/import, pasting the keys back in. Owned connections only:
 * memberships are granted by the owner, not copied.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const rows = (await listConnections(session.user.id)).filter((c) => c.myRole === "owner");
  const body = {
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "API keys and Postgres URLs are never exported. Add them when importing.",
    connections: rows.map((c) => ({
      name: c.name,
      url: c.url,
      hostname: c.hostname,
      environment: c.environment,
      keyRole: c.role,
      hasPostgresUrl: c.hasPostgresUrl,
      key: "",
      postgresUrl: "",
    })),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="suparbase-connections-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
