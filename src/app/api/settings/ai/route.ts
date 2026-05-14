import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import {
  clearOpenrouterKey,
  getUserSettings,
  setDefaultModel,
  setOpenrouterKey,
  toSummary,
} from "@/server/settings/repo";
import { probeOpenRouterKey, OpenRouterError } from "@/server/ai/openrouter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PutSchema = z.object({
  key: z.string().optional(),
  defaultModel: z.string().trim().min(1).max(160).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const row = await getUserSettings(session.user.id);
  return NextResponse.json(toSummary(row));
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  if (typeof parsed.data.key === "string") {
    const trimmed = parsed.data.key.trim();
    if (trimmed === "") {
      await clearOpenrouterKey(session.user.id);
    } else if (!trimmed.startsWith("sk-or-")) {
      return NextResponse.json(
        { category: "validation", message: "OpenRouter keys start with sk-or-." },
        { status: 400 },
      );
    } else {
      try {
        await probeOpenRouterKey(trimmed);
      } catch (e) {
        if (e instanceof OpenRouterError && e.category === "unauthorized") {
          return NextResponse.json(
            { category: "unauthorized", message: "OpenRouter rejected this key." },
            { status: 400 },
          );
        }
        return NextResponse.json(
          {
            category: e instanceof OpenRouterError ? e.category : "server",
            message: e instanceof Error ? e.message : "Failed to verify key.",
          },
          { status: 502 },
        );
      }
      await setOpenrouterKey(session.user.id, trimmed);
    }
  }

  if (parsed.data.defaultModel) {
    await setDefaultModel(session.user.id, parsed.data.defaultModel);
  }

  const row = await getUserSettings(session.user.id);
  return NextResponse.json(toSummary(row));
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  await clearOpenrouterKey(session.user.id);
  return new NextResponse(null, { status: 204 });
}
