import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { createInvitation } from "@/server/team/repo";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const InviteSchema = z.object({
  email: z.string().min(3).max(120),
  role: z.enum(["editor", "viewer"]),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await requireRole(session.user.id, id, "owner");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Only the connection owner can invite members." },
      { status: 403 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  try {
    const inv = await createInvitation(id, session.user.id, parsed.data.email, parsed.data.role);
    return NextResponse.json(inv, { status: 201 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Invite failed." },
      { status: 500 },
    );
  }
}
