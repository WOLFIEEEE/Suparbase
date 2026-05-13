import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { importChunk } from "@/server/proxy/import";
import { checkBulkRate } from "@/server/proxy/ratelimit";
import { introspectConnection } from "@/server/schema-introspect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "private, no-store" } as const;

interface Params {
  params: Promise<{ id: string; name: string }>;
}

interface ReqBody {
  rows?: unknown;
  onError?: unknown;
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
  const conn = await getConnectionForUser(session.user.id, id);
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

  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : null;
  if (!rows || rows.length < 1 || rows.length > 500) {
    return NextResponse.json(
      { category: "constraint", message: "rows must be an array of 1–500 entries." },
      { status: 400, headers: HEADERS },
    );
  }
  const onError: "skip" | "abort" = body.onError === "skip" ? "skip" : "abort";

  const tableName = decodeURIComponent(name);
  // Introspect for column metadata (so coerceForWrite has type info).
  try {
    const schema = await introspectConnection(conn);
    const table = schema.tables.find((t) => t.name === tableName);
    if (!table) {
      return NextResponse.json(
        { category: "not_found", message: "Table not found." },
        { status: 404, headers: HEADERS },
      );
    }
    if (table.kind !== "table") {
      return NextResponse.json(
        { category: "constraint", message: "Cannot import into a view." },
        { status: 400, headers: HEADERS },
      );
    }
    const result = await importChunk({
      userId: session.user.id,
      connection: conn,
      table,
      rows,
      onError,
    });
    return NextResponse.json(result, { status: 200, headers: HEADERS });
  } catch (e) {
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Import failed." },
      { status: 502, headers: HEADERS },
    );
  }
}
