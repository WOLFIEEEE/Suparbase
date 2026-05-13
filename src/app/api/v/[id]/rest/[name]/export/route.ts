import { type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { introspectConnection } from "@/server/schema-introspect";
import { checkReadRate } from "@/server/proxy/ratelimit";
import {
  streamExportCsv,
  streamExportJson,
  exportFilenameFor,
} from "@/server/proxy/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string; name: string }>;
}

function jsonError(status: number, category: string, message: string): Response {
  return new Response(JSON.stringify({ category, message }), {
    status,
    headers: { "content-type": "application/json", "Cache-Control": "private, no-store" },
  });
}

export async function GET(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return jsonError(401, "unauthorized", "Not signed in.");

  const { id, name } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return jsonError(404, "not_found", "Connection not found.");

  const rate = checkReadRate(session.user.id);
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({
        category: "rate_limited",
        message: `Too many exports. Try again in ${rate.retryAfterSeconds}s.`,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "Cache-Control": "private, no-store",
          "Retry-After": String(rate.retryAfterSeconds),
        },
      },
    );
  }

  const tableName = decodeURIComponent(name);
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  // Introspect once to know the table's text columns (search), PK (export-selected),
  // and the full column list (default when `columns` not specified).
  let textCols: string[] = [];
  let allCols: string[] = [];
  let primaryKeyCol: string | null = null;
  try {
    const schema = await introspectConnection(conn);
    const t = schema.tables.find((tt) => tt.name === tableName);
    if (!t) return jsonError(404, "not_found", "Table not found.");
    textCols = t.columns
      .filter((c) => c.category === "string" || c.category === "text")
      .map((c) => c.name)
      .slice(0, 8);
    allCols = t.columns.map((c) => c.name);
    primaryKeyCol = t.primaryKey[0] ?? null;
  } catch {
    return jsonError(502, "server", "Could not introspect schema.");
  }

  // Resolve columns: explicit query > default visible (analysis-aware ideally,
  // but we don't have analysis here — the client passes it via `columns`).
  const columnsParam = url.searchParams.get("columns");
  const columns = columnsParam
    ? columnsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : allCols;

  const limit = Number(url.searchParams.get("limit"));
  const sortRaw = url.searchParams.get("order");
  const sort: { column: string; direction: "asc" | "desc" } | undefined = (() => {
    if (!sortRaw) return undefined;
    const [col, dir] = sortRaw.split(".");
    if (!col) return undefined;
    return { column: col, direction: dir === "desc" ? "desc" : "asc" };
  })();
  const searchTerm = url.searchParams.get("q") ?? undefined;

  const filters: Array<{ column: string; value: string }> = [];
  for (const raw of url.searchParams.getAll("filter")) {
    // raw shape `col.op.value` — split by the first two dots, value may contain dots.
    const firstDot = raw.indexOf(".");
    if (firstDot <= 0) continue;
    const col = raw.slice(0, firstDot);
    const rest = raw.slice(firstDot + 1);
    filters.push({ column: col, value: rest });
  }

  // Export-Selected mode.
  const pksRaw = url.searchParams.get("in_pk");
  const pkValues = pksRaw ? pksRaw.split(",").filter(Boolean) : undefined;

  const stream =
    format === "json"
      ? streamExportJson({
          connection: conn,
          tableName,
          columns,
          limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
          sort,
          searchTerm,
          searchTextColumns: textCols,
          filters,
          pkColumn: primaryKeyCol ?? undefined,
          pkValues,
        })
      : streamExportCsv({
          connection: conn,
          tableName,
          columns,
          limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
          sort,
          searchTerm,
          searchTextColumns: textCols,
          filters,
          pkColumn: primaryKeyCol ?? undefined,
          pkValues,
        });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": format === "json" ? "application/json" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilenameFor(tableName, format)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
