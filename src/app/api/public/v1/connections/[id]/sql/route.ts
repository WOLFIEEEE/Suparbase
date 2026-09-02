import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiToken } from "@/server/api-tokens/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { executeSql, SqlExecutionError } from "@/server/proxy/sql-playground";
import { NoPostgresUrlError } from "@/server/proxy/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

const BodySchema = z.object({
  sql: z.string().min(1).max(20_000),
  statementTimeoutMs: z.number().int().positive().max(30_000).default(5_000),
});

/**
 * POST /api/public/v1/connections/:id/sql { sql } — run a SELECT read-only.
 * Always executes inside `SET TRANSACTION READ ONLY` + rollback; tokens have
 * no write scope, so there is no way to flip this to write mode.
 */
export async function POST(req: NextRequest, ctx: Params) {
  const gate = await requireApiToken(req);
  if ("response" in gate) return gate.response;
  const { id } = await ctx.params;
  const access = await getConnectionAccess(gate.principal.userId, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ category: "validation", message: "Body must be { sql: string }." }, { status: 400 });
  }
  try {
    const result = await executeSql({
      conn: access.conn,
      sql: parsed.data.sql,
      readOnly: true,
      statementTimeoutMs: parsed.data.statementTimeoutMs,
    });
    return NextResponse.json({
      columns: result.columns.map((c) => c.name),
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated,
      elapsedMs: result.elapsedMs,
    });
  } catch (e) {
    if (e instanceof NoPostgresUrlError) {
      return NextResponse.json(
        { category: "no_postgres_url", message: "This connection has no Direct Postgres URL." },
        { status: 400 },
      );
    }
    if (e instanceof SqlExecutionError) {
      const status = e.category === "validation" ? 400 : e.category === "rls" ? 403 : 502;
      return NextResponse.json({ category: e.category, message: e.message, detail: e.detail, hint: e.hint }, { status });
    }
    return NextResponse.json({ category: "server", message: "SQL failed." }, { status: 500 });
  }
}
