import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import { getSnapshot } from "@/server/snapshots/repo";
import { diffSnapshots, toSnapshotTables } from "@/lib/schema-snapshot";
import { limitOr429 } from "@/server/security/route-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET ?from=<snapshotId>&to=<snapshotId|live>
 * Diff two snapshots (or a snapshot against the live schema) server-side
 * so the client never has to download full column payloads.
 */
export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const limited = limitOr429(session.user.id, "read");
  if (limited) return limited;

  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "live";
  if (!UUID_RE.test(from) || (to !== "live" && !UUID_RE.test(to))) {
    return NextResponse.json({ category: "validation", message: "from/to must be snapshot ids (to may be 'live')." }, { status: 400 });
  }

  const before = await getSnapshot(id, from);
  if (!before) return NextResponse.json({ category: "not_found", message: "Snapshot not found." }, { status: 404 });

  let afterTables;
  let afterLabel: { id: string; createdAt: string | null };
  if (to === "live") {
    try {
      const schema = await introspectConnection(access.conn);
      afterTables = toSnapshotTables(schema);
      afterLabel = { id: "live", createdAt: new Date(schema.introspectedAt).toISOString() };
    } catch (e) {
      if (e instanceof IntrospectionError) {
        return NextResponse.json({ category: e.category, message: e.message }, { status: 502 });
      }
      return NextResponse.json({ category: "server", message: "Introspection failed." }, { status: 500 });
    }
  } else {
    const after = await getSnapshot(id, to);
    if (!after) return NextResponse.json({ category: "not_found", message: "Snapshot not found." }, { status: 404 });
    afterTables = after.tables;
    afterLabel = { id: after.summary.id, createdAt: after.summary.createdAt };
  }

  const diff = diffSnapshots(before.tables, afterTables);
  return NextResponse.json({
    from: { id: before.summary.id, createdAt: before.summary.createdAt },
    to: afterLabel,
    diff,
  });
}
