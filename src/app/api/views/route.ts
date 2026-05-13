import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { createView, listViewsForTable } from "@/server/views/repo";
import { checkReadRate, checkWriteRate } from "@/server/proxy/ratelimit";
import { AppError } from "@/lib/errors";
import type { ViewState } from "@/lib/types/views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "private, no-store" } as const;

interface CreateBody {
  connectionId?: unknown;
  schema?: unknown;
  table?: unknown;
  name?: unknown;
  state?: unknown;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { category: "unauthorized", message: "Not signed in." },
      { status: 401, headers: HEADERS },
    );
  }
  const rate = checkReadRate(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: `Too many requests. Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  const url = new URL(req.url);
  const connectionId = url.searchParams.get("connectionId");
  const schema = url.searchParams.get("schema") ?? "public";
  const tableName = url.searchParams.get("table");
  if (!connectionId || !tableName) {
    return NextResponse.json(
      { category: "constraint", message: "Missing connectionId or table." },
      { status: 400, headers: HEADERS },
    );
  }
  const conn = await getConnectionForUser(session.user.id, connectionId);
  if (!conn) {
    return NextResponse.json(
      { category: "not_found", message: "Connection not found." },
      { status: 404, headers: HEADERS },
    );
  }
  const views = await listViewsForTable(session.user.id, connectionId, schema, tableName);
  return NextResponse.json({ views }, { status: 200, headers: HEADERS });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { category: "unauthorized", message: "Not signed in." },
      { status: 401, headers: HEADERS },
    );
  }
  const rate = checkWriteRate(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: `Too many requests. Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json(
      { category: "constraint", message: "Malformed JSON body." },
      { status: 400, headers: HEADERS },
    );
  }
  const connectionId = typeof body.connectionId === "string" ? body.connectionId : null;
  const schema = typeof body.schema === "string" ? body.schema : "public";
  const tableName = typeof body.table === "string" ? body.table : null;
  const name = typeof body.name === "string" ? body.name : null;
  const state = body.state as ViewState | null;

  if (!connectionId || !tableName || !name || !state || typeof state !== "object") {
    return NextResponse.json(
      { category: "constraint", message: "connectionId, table, name, and state are required." },
      { status: 400, headers: HEADERS },
    );
  }
  const conn = await getConnectionForUser(session.user.id, connectionId);
  if (!conn) {
    return NextResponse.json(
      { category: "not_found", message: "Connection not found." },
      { status: 404, headers: HEADERS },
    );
  }

  try {
    const view = await createView({
      userId: session.user.id,
      connectionId,
      tableSchema: schema,
      tableName,
      name,
      state,
    });
    return NextResponse.json({ view }, { status: 201, headers: HEADERS });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(
        { category: e.category, message: e.message, columnHint: e.columnHint },
        { status: e.category === "constraint" ? 400 : 500, headers: HEADERS },
      );
    }
    return NextResponse.json(
      { category: "server", message: "Could not create view." },
      { status: 500, headers: HEADERS },
    );
  }
}
