import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { deleteConnection, getConnectionForUser, renameConnection, toSummary } from "@/server/connections/repo";
import { redact } from "@/lib/redact";

export const dynamic = "force-dynamic";

const RenameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await getConnectionForUser(session.user.id, id);
  if (!row) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json(toSummary(row));
}

export async function PATCH(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = RenameSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { category: "validation", message: first?.message ?? "Invalid input.", field: first?.path?.[0] },
      { status: 400 },
    );
  }
  try {
    const summary = await renameConnection(session.user.id, id, parsed.data.name);
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
  const ok = await deleteConnection(session.user.id, id);
  if (!ok) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
