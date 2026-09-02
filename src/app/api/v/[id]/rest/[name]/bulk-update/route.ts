import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForRole } from "@/server/connections/repo";
import { bulkUpdate } from "@/server/proxy/bulk";
import { checkBulkRate } from "@/server/proxy/ratelimit";
import { introspectConnection } from "@/server/schema-introspect";
import type { PrimaryKeyValue } from "@/lib/types/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "private, no-store" } as const;

interface Params {
  params: Promise<{ id: string; name: string }>;
}

interface ReqBody {
  primaryKeys?: unknown;
  patch?: unknown;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { category: "unauthorized", message: "Not signed in." },
      { status: 401, headers: HEADERS },
    );
  }

  const { id, name } = await ctx.params;
  const conn = await getConnectionForRole(session.user.id, id, "editor");
  if (!conn) {
    return NextResponse.json(
      { category: "not_found", message: "Connection not found." },
      { status: 404, headers: HEADERS },
    );
  }

  const rate = checkBulkRate(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: `Too many bulk batches. Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json(
      { category: "constraint", message: "Malformed JSON body." },
      { status: 400, headers: HEADERS },
    );
  }

  const primaryKeys = Array.isArray(body.primaryKeys) ? (body.primaryKeys as PrimaryKeyValue[]) : null;
  if (!primaryKeys || primaryKeys.length < 1 || primaryKeys.length > 5000) {
    return NextResponse.json(
      { category: "constraint", message: "primaryKeys must be an array of 1–5000 entries." },
      { status: 400, headers: HEADERS },
    );
  }

  const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch)
    ? (body.patch as Record<string, unknown>)
    : null;
  if (!patch || Object.keys(patch).length === 0) {
    return NextResponse.json(
      { category: "constraint", message: "patch must be a non-empty object." },
      { status: 400, headers: HEADERS },
    );
  }

  const tableName = decodeURIComponent(name);
  let primaryKeyCols: string[];
  try {
    const schema = await introspectConnection(conn);
    const table = schema.tables.find((t) => t.name === tableName);
    if (!table || table.primaryKey.length === 0) {
      return NextResponse.json(
        { category: "constraint", message: "Table has no primary key; bulk update unsupported." },
        { status: 400, headers: HEADERS },
      );
    }
    // Reject generated columns + unknown columns in `patch`.
    for (const col of Object.keys(patch)) {
      const meta = table.columns.find((c) => c.name === col);
      if (!meta) {
        return NextResponse.json(
          { category: "constraint", message: `Unknown column: ${col}`, columnHint: col },
          { status: 400, headers: HEADERS },
        );
      }
      if (meta.isGenerated) {
        return NextResponse.json(
          { category: "constraint", message: `${col} is generated and can't be updated.`, columnHint: col },
          { status: 400, headers: HEADERS },
        );
      }
    }
    primaryKeyCols = table.primaryKey;
  } catch {
    return NextResponse.json(
      { category: "server", message: "Could not introspect schema." },
      { status: 502, headers: HEADERS },
    );
  }

  try {
    const result = await bulkUpdate({
      userId: session.user.id,
      connection: conn,
      tableName,
      primaryKey: primaryKeyCols,
      primaryKeys,
      patch,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ updated: result.updated }, { status: 200, headers: HEADERS });
  } catch (e) {
    const err = e as { status?: number; message?: string; partial?: unknown };
    return NextResponse.json(
      { category: "server", message: err.message ?? "Bulk update failed.", partial: err.partial },
      { status: err.status && err.status >= 400 && err.status < 600 ? err.status : 502, headers: HEADERS },
    );
  }
}
