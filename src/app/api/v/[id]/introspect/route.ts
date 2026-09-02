import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionAccess, roleAtLeast } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import { executeSql } from "@/server/proxy/sql-playground";
import { getSnapshot, recordSnapshot } from "@/server/snapshots/repo";
import { notifyConnection } from "@/server/notifications/repo";
import { diffSnapshots, summarizeDiff, toSnapshotTables } from "@/lib/schema-snapshot";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Returns the introspected schema for a connection.
 *
 * `?force=true` triggers a server-side PostgREST schema-cache reload
 * before introspecting. PostgREST caches its OpenAPI document
 * internally, so a fresh `CREATE TABLE` on the project won't show up
 * via /rest/v1/ for ~10 minutes by default. Sending
 * `NOTIFY pgrst, 'reload schema'` tells it to drop the cache now.
 * This requires the optional Direct Postgres URL - without it we
 * still introspect, but the result may be slightly stale.
 */
export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized", message: "Not signed in." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";
  const conn = access.conn;
  let postgrestReloaded = false;
  if (force && roleAtLeast(access.role, "editor") && conn.encryptedPostgresUrl) {
    try {
      // PostgREST listens on this channel; the payload is the literal
      // "reload schema" string. Effect is near-instant; we don't have
      // to wait, but a 200ms gap is enough for PostgREST to swap its
      // cache before we ask for the OpenAPI doc.
      await executeSql({
        conn,
        sql: `NOTIFY pgrst, 'reload schema'`,
        readOnly: false,
        statementTimeoutMs: 3_000,
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      postgrestReloaded = true;
    } catch (e) {
      log.warn("schema-reload NOTIFY failed, falling back to cached introspection", {
        err: e,
        connectionId: id,
      });
    }
  }

  try {
    const schema = await introspectConnection(conn);
    // Drift timeline: store a snapshot whenever the shape changed since the
    // last one. Fingerprint short-circuits, so this is one cheap SELECT on
    // the steady state. Never fails the request.
    try {
      const captured = await recordSnapshot(id, schema, { source: "auto", createdBy: session.user.id });
      if (captured.inserted && captured.previous) {
        const previous = await getSnapshot(id, captured.previous.id);
        if (previous) {
          const diff = diffSnapshots(previous.tables, toSnapshotTables(schema));
          void notifyConnection(id, {
            kind: "schema_changed",
            title: `Schema changed on ${conn.name}`,
            body: summarizeDiff(diff),
            href: `/c/${id}/schema/history`,
          });
        }
      }
    } catch (e) {
      log.warn("schema snapshot capture failed", { err: e, connectionId: id });
    }
    return NextResponse.json(
      { schema, postgrestReloaded },
      {
        headers: {
          // Belt-and-braces: no caching on either side of the wire.
          "Cache-Control": "no-store, no-transform",
        },
      },
    );
  } catch (e) {
    if (e instanceof IntrospectionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: e.category === "unauthorized" ? 401 : 502 });
    }
    return NextResponse.json({ category: "server", message: "Introspection failed." }, { status: 500 });
  }
}
