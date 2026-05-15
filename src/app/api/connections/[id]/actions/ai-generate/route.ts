import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { introspectConnection, IntrospectionError } from "@/server/schema-introspect";
import {
  generateAction,
  validateGeneratedWebhook,
  validateScopeShape,
  validateSqlPlaceholders,
} from "@/server/ai/action-generate";
import { OpenRouterError } from "@/server/ai/openrouter";
import { getUserSettings, readOpenrouterKey } from "@/server/settings/repo";
import { limitOr429 } from "@/server/security/route-guards";
import { AppError } from "@/lib/errors";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

const BodySchema = z.object({
  prompt: z.string().min(3).max(1_000),
  scope: z.enum(["global", "table", "row"]).optional(),
  kind: z.enum(["sql", "webhook"]).optional(),
  /** Optional focus table — when the user opens AI-generate from
   *  /c/[id]/tables/[name] or a row-detail page, this scopes the
   *  schema context the model sees. */
  tableSchema: z.string().max(120).optional(),
  tableName: z.string().max(120).optional(),
});

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Natural-language custom-action builder:
 *   POST { prompt, scope?, kind?, tableSchema?, tableName? }
 *   → { action, model }
 *
 * Flow:
 *   1. Auth + editor+ role (same tier that creates actions manually).
 *   2. AI rate-limit bucket.
 *   3. OpenRouter key + model from user settings.
 *   4. Introspect schema (focus table surfaced in full).
 *   5. Generate action config via OpenRouter.
 *   6. Structural validation:
 *      - placeholder count agrees with params + implicit PK
 *      - webhook URL is safe (validateWebhookUrl) - same checks the
 *        save path uses
 *      - scope-vs-tableName agreement
 *   7. Return. The save path will run its own validation pass when
 *      the user clicks Create.
 *
 * We do NOT execute the action against the project — writes would
 * actually fire, and webhooks would actually call third-party hosts.
 * Structural validation is the right safety pass for this shape.
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
      { category: "forbidden", message: "Editor or owner role required to use the action builder." },
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

  const settings = await getUserSettings(session.user.id);
  const apiKey = readOpenrouterKey(settings);
  if (!apiKey) {
    return NextResponse.json(
      {
        category: "no_key",
        message:
          "Add an OpenRouter API key in Settings → AI to use the action builder.",
      },
      { status: 400 },
    );
  }
  const model = settings?.defaultModel ?? "anthropic/claude-3.5-haiku";

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

  let action;
  try {
    action = await generateAction({
      apiKey,
      model,
      prompt: parsed.data.prompt,
      schema,
      focusTable:
        parsed.data.tableSchema && parsed.data.tableName
          ? {
              schemaName: parsed.data.tableSchema,
              tableName: parsed.data.tableName,
            }
          : null,
      defaultScope: parsed.data.scope,
      defaultKind: parsed.data.kind,
    });
  } catch (e) {
    if (e instanceof OpenRouterError) {
      log.warn("ai-generate action OpenRouter failure", {
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

  // Structural safety pass — the equivalent of the read-only SQL
  // execution the widget builder runs.
  try {
    validateScopeShape(action);
    validateSqlPlaceholders(action);
    validateGeneratedWebhook(action);
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(
        { category: e.category, message: e.message, action },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Validation failed.", action },
      { status: 422 },
    );
  }

  return NextResponse.json({ action, model });
}
