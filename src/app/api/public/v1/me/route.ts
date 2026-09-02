import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema/auth";
import { requireApiToken } from "@/server/api-tokens/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/public/v1/me — who this token belongs to. */
export async function GET(req: NextRequest) {
  const gate = await requireApiToken(req);
  if ("response" in gate) return gate.response;
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, gate.principal.userId))
    .limit(1);
  return NextResponse.json({ user: user ?? null, tokenId: gate.principal.tokenId, scope: "read" });
}
