import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { sqlSnippets } from "@/server/schema";
import { getConnectionAccess, roleAtLeast } from "@/server/connections/repo";
import { createReport, listReports } from "@/server/reports/repo";
import { validateWebhookUrl } from "@/server/actions/repo";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

const MAX_REPORTS = 50;

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const reports = await listReports(session.user.id, id);
  return NextResponse.json({ reports });
}

const CreateSchema = z.object({
  snippetId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  delivery: z.enum(["email", "webhook"]),
  target: z.string().trim().min(3).max(2000),
  intervalHours: z.number().int().min(1).max(24 * 30),
});

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  if (!roleAtLeast(access.role, "editor")) {
    return NextResponse.json({ category: "forbidden", message: "Editor access is required." }, { status: 403 });
  }

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const { snippetId, name, delivery, target, intervalHours } = parsed.data;

  // Validate delivery target.
  if (delivery === "email") {
    if (!z.string().email().safeParse(target).success) {
      return NextResponse.json({ category: "validation", message: "Enter a valid email address." }, { status: 400 });
    }
  } else {
    try {
      validateWebhookUrl(target);
    } catch (e) {
      const message = e instanceof AppError ? e.message : "Invalid webhook URL.";
      return NextResponse.json({ category: "validation", message }, { status: 400 });
    }
  }

  // Ensure the snippet belongs to this user + connection.
  const [snippet] = await db
    .select({ id: sqlSnippets.id })
    .from(sqlSnippets)
    .where(
      and(
        eq(sqlSnippets.id, snippetId),
        eq(sqlSnippets.userId, session.user.id),
        eq(sqlSnippets.connectionId, id),
      ),
    )
    .limit(1);
  if (!snippet) {
    return NextResponse.json({ category: "validation", message: "Snippet not found." }, { status: 400 });
  }

  const existing = await listReports(session.user.id, id);
  if (existing.length >= MAX_REPORTS) {
    return NextResponse.json(
      { category: "validation", message: `Report limit reached (${MAX_REPORTS}). Delete one first.` },
      { status: 400 },
    );
  }

  const report = await createReport({
    userId: session.user.id,
    connectionId: id,
    snippetId,
    name,
    delivery,
    target,
    intervalHours,
  });
  return NextResponse.json({ report }, { status: 201 });
}
