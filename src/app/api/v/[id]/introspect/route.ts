import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import { executeSql } from "@/server/proxy/sql-playground";
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
 * This requires the optional Direct Postgres URL — without it we
 * still introspect, but the result may be slightly stale.
 */
export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized", message: "Not signed in." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";
  let postgrestReloaded = false;
  if (force && conn.encryptedPostgresUrl) {
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
