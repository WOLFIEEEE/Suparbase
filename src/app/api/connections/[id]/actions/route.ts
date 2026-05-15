import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getConnectionForUser, requireRole } from "@/server/connections/repo";
import { createAction, listActionsForConnection } from "@/server/actions/repo";
import { AppError } from "@/lib/errors";
import { limitOr429 } from "@/server/security/route-guards";

export const dynamic = "force-dynamic";

const ParamSchema = z.object({
  name: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  type: z.enum(["string", "number", "boolean", "json"]),
  required: z.boolean(),
  placeholder: z.string().max(120).optional(),
});

const InputSchema = z
  .object({
    name: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    description: z.string().max(200).optional().nullable(),
    scope: z.enum(["global", "table", "row"]),
    tableSchema: z.string().max(120).optional().nullable(),
    tableName: z.string().max(120).optional().nullable(),
    kind: z.enum(["sql", "webhook"]),
    sqlTemplate: z.string().max(8000).optional().nullable(),
    readOnly: z.boolean().optional(),
    webhookUrl: z.string().max(500).optional().nullable(),
    webhookMethod: z.enum(["POST", "PATCH", "PUT", "DELETE"]).optional().nullable(),
    webhookHeaders: z.record(z.string().max(120), z.string().max(500)).optional().nullable(),
    params: z.array(ParamSchema).max(8).optional(),
    danger: z.boolean().optional(),
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
  const actions = await listActionsForConnection(session.user.id, id);
  return NextResponse.json({ actions });
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  // Creating an action persists SQL templates / webhook URLs that anyone
  // with access can then execute. Editor or owner only.
  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to create actions." },
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
    const action = await createAction(session.user.id, id, parsed.data);
    return NextResponse.json(action, { status: 201 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Failed to create action." },
      { status: 500 },
    );
  }
}
