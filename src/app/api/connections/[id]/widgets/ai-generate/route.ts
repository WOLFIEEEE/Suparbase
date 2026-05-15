import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import { generateWidget } from "@/server/ai/widget-generate";
import { OpenRouterError } from "@/server/ai/openrouter";
import { executeSql, SqlExecutionError } from "@/server/proxy/sql-playground";
import { getUserSettings, readOpenrouterKey } from "@/server/settings/repo";
import { limitOr429 } from "@/server/security/route-guards";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

const BodySchema = z.object({
  prompt: z.string().min(3).max(1_000),
});

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Natural-language widget builder:
 *   POST { prompt: "show me weekly signups" }
 *   → { widget: { type, title, sql, visConfig }, preview: {...} }
 *
 * Flow:
 *   1. Auth + role check (editor+ since this is the same access tier
 *      that's allowed to create widgets directly).
 *   2. AI rate-limit bucket.
 *   3. Load the user's OpenRouter key + model from settings.
 *   4. Introspect the connection's schema (PostgREST OpenAPI).
 *   5. Ask OpenRouter for a strictly-typed widget config.
 *   6. Execute the generated SQL read-only to validate it actually
 *      runs against the project, capturing the first few rows as a
 *      preview. This catches every "model hallucinated a column"
 *      failure mode at API time, not save time.
 *   7. Return both.
 */
export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to use the widget builder." },
      { status: 403 },
    );
  }
  const limited = limitOr429(session.user.id, "ai");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { category: "validation", message: "Body must be JSON with a `prompt` string." },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        category: "validation",
        message: parsed.error.issues[0]?.message ?? "Invalid input.",
      },
      { status: 400 },
    );
  }

  // Load OpenRouter credentials + the user's preferred model.
  const settings = await getUserSettings(session.user.id);
  const apiKey = readOpenrouterKey(settings);
  if (!apiKey) {
    return NextResponse.json(
      {
        category: "no_key",
        message:
          "Add an OpenRouter API key in Settings → AI to use the widget builder.",
      },
      { status: 400 },
    );
  }
  const model = settings?.defaultModel ?? "anthropic/claude-3.5-haiku";

  // Introspect the schema so the model knows what tables + columns
  // exist. Skip cache: we want the freshest picture before generation.
  let schema;
  try {
    schema = await introspectConnection(access.conn);
  } catch (e) {
    if (e instanceof IntrospectionError) {
      return NextResponse.json(
        { category: e.category, message: e.message },
        { status: e.category === "unauthorized" ? 401 : 502 },
      );
    }
    return NextResponse.json(
      { category: "server", message: "Could not load the project schema." },
      { status: 500 },
    );
  }

  // ── Ask the model. ──
  let widget;
  try {
    widget = await generateWidget({
      apiKey,
      model,
      prompt: parsed.data.prompt,
      schema,
    });
  } catch (e) {
    if (e instanceof OpenRouterError) {
      log.warn("ai-generate widget OpenRouter failure", {
        err: e,
        connectionId: id,
        userId: session.user.id,
      });
      const status =
        e.category === "unauthorized"
          ? 400
          : e.category === "rate_limited"
          ? 429
          : 502;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "AI generation failed." },
      { status: 500 },
    );
  }

  // ── Validate by execution. ──
  // Run the generated SQL inside a read-only transaction. This catches
  // hallucinated column names + syntax errors before the user is asked
  // to save anything.
  let preview;
  try {
    const result = await executeSql({
      conn: access.conn,
      sql: widget.sql,
      readOnly: true,
      statementTimeoutMs: 5_000,
    });
    preview = {
      columns: result.columns,
      rows: result.rows.slice(0, 5),
      rowCount: result.rowCount,
      truncated: result.rowCount > 5,
      elapsedMs: result.elapsedMs,
    };
  } catch (e) {
    if (e instanceof SqlExecutionError) {
      // Surface the Postgres error verbatim so the user knows the SQL
      // didn't validate. The UI can offer "Try again" with the model
      // by including the error in a refinement prompt.
      return NextResponse.json(
        {
          category: "validation",
          message: `Generated SQL didn't execute: ${e.message}. Try rephrasing.`,
          widget,
          sqlError: e.message,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        category: "server",
        message: `Generated SQL didn't execute: ${(e as Error).message ?? "unknown"}.`,
        widget,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ widget, preview, model });
}
