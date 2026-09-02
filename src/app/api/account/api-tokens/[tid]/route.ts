import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { revokeToken } from "@/server/api-tokens/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  params: Promise<{ tid: string }>;
}

/** DELETE — revoke. Revoked tokens stay listed (greyed) for the audit trail. */
export async function DELETE(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { tid } = await ctx.params;
  const ok = await revokeToken(session.user.id, tid);
  if (!ok) return NextResponse.json({ category: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
