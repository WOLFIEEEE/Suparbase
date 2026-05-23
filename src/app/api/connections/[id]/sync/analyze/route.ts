import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionAccess, getConnectionForUser } from "@/server/connections/repo";
import { getProfile } from "@/server/sync/repo";
import { checkAiRate } from "@/server/proxy/ratelimit";
import { getUserSettings, readOpenrouterKey } from "@/server/settings/repo";
import { introspectCatalog } from "@/server/sync/catalog";
import { openBaseClient } from "@/server/sync/safety";
import { runAdvisor } from "@/server/sync/ai-advisor";
import { NoPostgresUrlError } from "@/server/proxy/postgres";
import { OpenRouterError } from "@/server/ai/openrouter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

const analyzeSchema = z
  .object({
    profileId: z.string().uuid().optional(),
    baseConnectionId: z.string().uuid().optional(),
    tier: z.enum(["schema", "redacted", "raw"]).default("schema"),
  })
  .refine((d) => d.profileId || d.baseConnectionId, {
    message: "profileId or baseConnectionId is required.",
  });

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const parsed = analyzeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  let baseConnectionId = parsed.data.baseConnectionId;
  if (parsed.data.profileId) {
    const profile = await getProfile(session.user.id, parsed.data.profileId);
    if (!profile || profile.targetConnectionId !== id) {
      return NextResponse.json({ category: "not_found" }, { status: 404 });
    }
    baseConnectionId = profile.baseConnectionId;
  }
  const base = await getConnectionForUser(session.user.id, baseConnectionId!);
  if (!base) {
    return NextResponse.json(
      { category: "validation", message: "Base connection not found or not accessible." },
      { status: 400 },
    );
  }

  const settings = await getUserSettings(session.user.id);
  const apiKey = readOpenrouterKey(settings);
  if (!apiKey) {
    return NextResponse.json(
      {
        category: "no_key",
        message: "Add an OpenRouter API key in AI settings to use AI analysis.",
      },
      { status: 400 },
    );
  }

  const limit = checkAiRate(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many AI analyses, try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const baseSql = openBaseClient(base);
  const targetSql = openBaseClient(access.conn);
  try {
    const [baseCatalog, targetCatalog] = await Promise.all([
      introspectCatalog(baseSql),
      introspectCatalog(targetSql),
    ]);
    const result = await runAdvisor({
      baseSql,
      baseCatalog,
      targetCatalog,
      apiKey,
      model: settings?.defaultModel ?? "anthropic/claude-3.5-haiku",
      tier: parsed.data.tier,
    });
    return NextResponse.json({
      suggestions: result.suggestions,
      model: result.model,
      usage: result.usage,
    });
  } catch (e) {
    if (e instanceof NoPostgresUrlError) {
      return NextResponse.json({ category: "no_postgres_url", message: e.message }, { status: 400 });
    }
    if (e instanceof OpenRouterError) {
      const status = e.category === "unauthorized" ? 400 : e.category === "rate_limited" ? 429 : 502;
      return NextResponse.json({ category: e.category, message: e.message }, { status });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Analysis failed." },
      { status: 500 },
    );
  } finally {
    await Promise.allSettled([baseSql.end({ timeout: 5 }), targetSql.end({ timeout: 5 })]);
  }
}
