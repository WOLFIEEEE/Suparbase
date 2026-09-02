import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import {
  deleteConnection,
  getConnectionAccess,
  requireRole,
  toSummary,
  updateConnectionMeta,
} from "@/server/connections/repo";
import { CONNECTION_ENVIRONMENTS } from "@/server/schema/connections";
import { isSentryScanInterval } from "@/lib/sentry/schedule";
import { redact } from "@/lib/redact";

export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    environment: z.enum(CONNECTION_ENVIRONMENTS as [string, ...string[]]).nullable().optional(),
    sentryScanIntervalHours: z
      .number()
      .int()
      .refine(isSentryScanInterval, {
        message: "Interval must be one of 6, 12, 24, 72, or 168 hours.",
      })
      .nullable()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json(toSummary(access.conn, access.role));
}

export async function PATCH(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await requireRole(session.user.id, id, "owner");
  if (!access) return NextResponse.json({ category: "forbidden" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { category: "validation", message: first?.message ?? "Invalid input.", field: first?.path?.[0] },
      { status: 400 },
    );
  }
  try {
    const summary = await updateConnectionMeta(session.user.id, id, {
      name: parsed.data.name,
      environment: parsed.data.environment as
        | (typeof CONNECTION_ENVIRONMENTS)[number]
        | null
        | undefined,
      sentryScanIntervalHours: parsed.data.sentryScanIntervalHours,
    });
    if (!summary) return NextResponse.json({ category: "not_found" }, { status: 404 });
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? redact(e.message) : "Update failed.";
    if (message.includes("connections_user_name_unique")) {
      return NextResponse.json(
        { category: "constraint", message: "A connection with that name already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json({ category: "server", message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await requireRole(session.user.id, id, "owner");
  if (!access) return NextResponse.json({ category: "forbidden" }, { status: 403 });
  const ok = await deleteConnection(session.user.id, id);
  if (!ok) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
