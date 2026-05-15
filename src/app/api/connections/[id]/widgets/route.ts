import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser, requireRole } from "@/server/connections/repo";
import { createWidget, listWidgets } from "@/server/dashboards/repo";
import { AppError } from "@/lib/errors";
import { limitOr429 } from "@/server/security/route-guards";

export const dynamic = "force-dynamic";

const VisSchema = z
  .object({
    valueColumn: z.string().max(60).optional(),
    format: z.enum(["number", "currency", "percent"]).optional(),
    unit: z.string().max(20).optional(),
    prefix: z.string().max(20).optional(),
    labelColumn: z.string().max(60).optional(),
    columns: z.array(z.string().max(60)).max(20).optional(),
  })
  .strict();

const InputSchema = z
  .object({
    type: z.enum(["kpi", "bar", "line", "list"]),
    title: z.string().min(1).max(60),
    description: z.string().max(200).optional().nullable(),
    sql: z.string().min(1).max(4000),
    visConfig: VisSchema.optional(),
    position: z.number().int().min(0).max(1000).optional(),
    span: z.enum(["1", "2", "full"]).optional(),
    refreshSec: z.number().int().min(0).max(3600).optional(),
  })
  .strict();

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const conn = await getConnectionForUser(session.user.id, id);
  if (!conn) return NextResponse.json({ category: "not_found" }, { status: 404 });
  const widgets = await listWidgets(session.user.id, id);
  return NextResponse.json({ widgets });
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to create widgets." },
      { status: 403 },
    );
  }
  {
    const limited = limitOr429(session.user.id, "write");
    if (limited) return limited;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { category: "validation", message: first?.message ?? "Invalid input.", field: first?.path?.[0] },
      { status: 400 },
    );
  }
  try {
    const widget = await createWidget(session.user.id, id, parsed.data);
    return NextResponse.json(widget, { status: 201 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Failed to create widget." },
      { status: 500 },
    );
  }
}
