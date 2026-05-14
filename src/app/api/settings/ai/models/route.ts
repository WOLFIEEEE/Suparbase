import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { fetchOpenRouterModels, OpenRouterError } from "@/server/ai/openrouter";
import { getUserSettings, readOpenrouterKey } from "@/server/settings/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Short-lived in-memory cache so the settings page doesn't refetch the
 * full OpenRouter catalogue on every keystroke. Reset on deploy.
 */
let cache: { at: number; models: Awaited<ReturnType<typeof fetchOpenRouterModels>> } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ models: cache.models, cached: true });
  }

  const settings = await getUserSettings(session.user.id);
  const apiKey = readOpenrouterKey(settings);

  try {
    const models = await fetchOpenRouterModels(apiKey);
    cache = { at: Date.now(), models };
    return NextResponse.json({ models, cached: false });
  } catch (e) {
    if (e instanceof OpenRouterError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Failed to load models." },
      { status: 500 },
    );
  }
}
