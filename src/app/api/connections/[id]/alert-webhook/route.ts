import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { connections } from "@/server/schema";
import { getConnectionAccess } from "@/server/connections/repo";
import { validateWebhookUrl } from "@/server/actions/repo";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const BodySchema = z.object({
  /** null / empty string clears the webhook. */
  url: z.string().trim().max(2000).nullable(),
});

/**
 * PUT /api/connections/[id]/alert-webhook — set or clear the Sentry alert
 * webhook. Owner-only (it points at an external system the whole team's
 * scans will notify). The URL runs through the same SSRF blocklist as
 * custom-action webhooks.
 */
export async function PUT(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  if (access.role !== "owner") {
    return NextResponse.json(
      { category: "forbidden", message: "Only the owner can configure the alert webhook." },
      { status: 403 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  const url = parsed.data.url?.trim() || null;
  if (url) {
    try {
      validateWebhookUrl(url);
    } catch (e) {
      const message = e instanceof AppError ? e.message : "Invalid webhook URL.";
      return NextResponse.json({ category: "validation", message }, { status: 400 });
    }
  }

  await db
    .update(connections)
    .set({ alertWebhookUrl: url })
    .where(and(eq(connections.id, id), eq(connections.userId, access.conn.userId)));
  return NextResponse.json({ ok: true, alertWebhookUrl: url });
}
