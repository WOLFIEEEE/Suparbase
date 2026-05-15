import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { setFindingStatus } from "@/server/sentry/repo";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved"]),
});

interface Params {
  params: Promise<{ id: string; findingId: string }>;
}

export async function PATCH(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, findingId } = await ctx.params;
  const access = await requireRole(session.user.id, id, "editor");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Editor or owner role required to mutate findings." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  try {
    const f = await setFindingStatus(session.user.id, id, findingId, parsed.data.status);
    if (!f) return NextResponse.json({ category: "not_found" }, { status: 404 });
    return NextResponse.json(f);
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Update failed." },
      { status: 500 },
    );
  }
}
