import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { markRead } from "@/server/notifications/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({ ids: z.array(z.string().uuid()).max(200).default([]) });

/** POST /api/notifications/read { ids?: [] } — empty ids marks everything read. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ category: "validation", message: "Invalid body." }, { status: 400 });
  }
  const updated = await markRead(session.user.id, parsed.data.ids);
  return NextResponse.json({ updated });
}
