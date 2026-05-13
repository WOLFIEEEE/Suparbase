import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import { loadCachedAnalysis } from "@/server/ai/analyze";
import { runChat, type ChatMessageIn } from "@/server/ai/chat";
import { OpenRouterError } from "@/server/ai/openrouter";
import { getUserSettings, readOpenrouterKey } from "@/server/settings/repo";
import { checkAiRate } from "@/server/proxy/ratelimit";
import { heuristicAnalysisFor } from "@/lib/presets/heuristic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(12),
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

  let body: { messages: ChatMessageIn[] };
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { category: "validation", message: (e as Error).message ?? "Bad request body." },
      { status: 400 },
    );
  }

  const limit = checkAiRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many AI requests — try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const settings = await getUserSettings(session.user.id);
  const apiKey = readOpenrouterKey(settings);
  if (!apiKey) {
    return NextResponse.json(
      {
        category: "no_key",
        message:
          "Add an OpenRouter API key in Settings → AI to enable the chat assistant.",
      },
      { status: 400 },
    );
  }
  const model = settings?.defaultModel ?? "anthropic/claude-3.5-haiku";

  let schema;
  try {
    schema = await introspectConnection(conn);
  } catch (e) {
    if (e instanceof IntrospectionError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { category: "server", message: "Failed to introspect schema." },
      { status: 500 },
    );
  }

  // Prefer the cached analysis. If there isn't one, fall back to heuristic
  // descriptions on the fly — we don't want a chat request to block on a
  // potentially-slow full AI analysis.
  let analyses;
  try {
    const cached = await loadCachedAnalysis(session.user.id, id);
    if ("tables" in cached) {
      analyses = cached.tables;
    } else {
      analyses = schema.tables.map(heuristicAnalysisFor);
    }
  } catch {
    analyses = schema.tables.map(heuristicAnalysisFor);
  }

  try {
    const result = await runChat({
      apiKey,
      model,
      hostname: conn.hostname,
      history: body.messages,
      ctx: { conn, schema, analyses },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof OpenRouterError) {
      const status = e.category === "unauthorized" ? 400 : 502;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Chat failed." },
      { status: 500 },
    );
  }
}
