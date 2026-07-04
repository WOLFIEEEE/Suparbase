import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionAccess } from "@/server/connections/repo";
import { createWatch, listWatches } from "@/server/watches/repo";
import { validateWebhookUrl } from "@/server/actions/repo";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const MAX_WATCHES = 50;

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const watches = await listWatches(session.user.id, id);
  return NextResponse.json({ watches });
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sql: z.string().trim().min(1).max(20_000),
  webhookUrl: z.string().trim().max(2000).nullable().optional(),
  intervalMinutes: z.number().int().min(5).max(60 * 24),
});

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const webhookUrl = parsed.data.webhookUrl?.trim() || null;
  if (webhookUrl) {
    try {
      validateWebhookUrl(webhookUrl);
    } catch (e) {
      const message = e instanceof AppError ? e.message : "Invalid webhook URL.";
      return NextResponse.json({ category: "validation", message }, { status: 400 });
    }
  } else if (!access.conn.alertWebhookUrl) {
    return NextResponse.json(
      {
        category: "validation",
        message: "Set a webhook URL, or configure the connection's Sentry alert webhook to use as the fallback.",
      },
      { status: 400 },
    );
  }

  const existing = await listWatches(session.user.id, id);
  if (existing.length >= MAX_WATCHES) {
    return NextResponse.json(
      { category: "validation", message: `Watch limit reached (${MAX_WATCHES}). Delete one first.` },
      { status: 400 },
    );
  }

  const watch = await createWatch({
    userId: session.user.id,
    connectionId: id,
    name: parsed.data.name,
    sql: parsed.data.sql,
    webhookUrl,
    intervalMinutes: parsed.data.intervalMinutes,
  });
  return NextResponse.json({ watch }, { status: 201 });
}
