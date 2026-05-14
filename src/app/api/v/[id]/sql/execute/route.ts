import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { executeSql, SqlExecutionError } from "@/server/proxy/sql-playground";
import { NoPostgresUrlError } from "@/server/proxy/postgres";
import { checkReadRate, checkWriteRate } from "@/server/proxy/ratelimit";
import { auditWrite } from "@/server/audit/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  sql: z.string().min(1).max(20_000),
  readOnly: z.boolean().default(true),
  statementTimeoutMs: z.number().int().positive().max(60_000).default(5_000),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) {
    return NextResponse.json({ category: "not_found", message: "Connection not found." }, { status: 404 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Bad request body." },
      { status: 400 },
    );
  }

  // Separate rate-limit buckets: read-only queries are cheap, write queries
  // share the same budget as PostgREST writes.
  const limit = body.readOnly ? checkReadRate(session.user.id) : checkWriteRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many SQL requests: try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await executeSql({
      conn,
      sql: body.sql,
      readOnly: body.readOnly,
      statementTimeoutMs: body.statementTimeoutMs,
    });

    if (!body.readOnly) {
      // Record a single audit_log entry for the write so the row history
      // panel and recent-activity feed both pick it up. We store the
      // SQL itself as `afterRow.sql` for forensic purposes.
      void auditWrite({
        userId: session.user.id,
        connectionId: id,
        schemaName: "public",
        tableName: "(sql)",
        primaryKey: null,
        verb: "update",
        httpStatus: 200,
        beforeRow: null,
        afterRow: {
          sql: body.sql,
          command: result.command,
          rowCount: result.rowCount,
        },
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NoPostgresUrlError) {
      return NextResponse.json(
        {
          category: "no_postgres_url",
          message: "Add a direct Postgres URL on the RLS page to use the SQL playground.",
        },
        { status: 400 },
      );
    }
    if (e instanceof SqlExecutionError) {
      const status =
        e.category === "validation"
          ? 400
          : e.category === "rls"
          ? 403
          : e.category === "no_postgres_url"
          ? 400
          : 502;
      return NextResponse.json(
        {
          category: e.category,
          message: e.message,
          detail: e.detail,
          position: e.position,
          hint: e.hint,
        },
        { status },
      );
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "SQL failed." },
      { status: 500 },
    );
  }
}
