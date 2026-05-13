import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { deleteView, updateView } from "@/server/views/repo";
import { checkWriteRate } from "@/server/proxy/ratelimit";
import { AppError } from "@/lib/errors";
import type { ViewState } from "@/lib/types/views";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "private, no-store" } as const;

interface PatchBody {
  name?: unknown;
  state?: unknown;
}

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: Params) {
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
      { category: "rate_limited", message: `Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json(
      { category: "constraint", message: "Malformed JSON body." },
      { status: 400, headers: HEADERS },
    );
  }
  const name = typeof body.name === "string" ? body.name : undefined;
  const state = body.state as ViewState | undefined;
  if (name === undefined && state === undefined) {
    return NextResponse.json(
      { category: "constraint", message: "Provide at least one of name or state." },
      { status: 400, headers: HEADERS },
    );
  }
  try {
    const view = await updateView({ userId: session.user.id, id, name, state });
    if (!view) {
      return NextResponse.json(
        { category: "not_found", message: "View not found." },
        { status: 404, headers: HEADERS },
      );
    }
    return NextResponse.json({ view }, { status: 200, headers: HEADERS });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(
        { category: e.category, message: e.message, columnHint: e.columnHint },
        { status: e.category === "constraint" ? 400 : 500, headers: HEADERS },
      );
    }
    return NextResponse.json(
      { category: "server", message: "Update failed." },
      { status: 500, headers: HEADERS },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Params) {
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
      { category: "rate_limited", message: `Try again in ${rate.retryAfterSeconds}s.` },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }
  const { id } = await ctx.params;
  const deleted = await deleteView(session.user.id, id);
  if (!deleted) {
    return NextResponse.json(
      { category: "not_found", message: "View not found." },
      { status: 404, headers: HEADERS },
    );
  }
  return new Response(null, { status: 204, headers: HEADERS });
}
