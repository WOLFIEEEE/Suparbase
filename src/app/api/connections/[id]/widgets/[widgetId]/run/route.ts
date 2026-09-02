import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { getWidget } from "@/server/dashboards/repo";
import { executeSql, SqlExecutionError } from "@/server/proxy/sql-playground";
import { checkAiRate } from "@/server/proxy/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIMEOUT_MS = 5_000;

interface Params {
  params: Promise<{ id: string; widgetId: string }>;
}

export async function POST(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, widgetId } = await ctx.params;

  const conn = await getConnectionForRole(session.user.id, id, "viewer");
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const widget = await getWidget(session.user.id, id, widgetId);
  if (!widget) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const limit = checkAiRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many widget refreshes: try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const res = await executeSql({
      conn,
      sql: widget.sql,
      readOnly: true,
      statementTimeoutMs: TIMEOUT_MS,
    });
    return NextResponse.json({
      columns: res.columns,
      rows: res.rows,
      rowCount: res.rowCount,
      elapsedMs: res.elapsedMs,
      notices: res.notices,
    });
  } catch (e) {
    if (e instanceof SqlExecutionError) {
      const status =
        e.category === "validation" ? 400 : e.category === "rls" ? 403 : 500;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Widget run failed." },
      { status: 500 },
    );
  }
}
