import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { countActiveTokens, createToken, listTokens, MAX_TOKENS_PER_USER } from "@/server/api-tokens/repo";
import { limitOr429 } from "@/server/security/route-guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const tokens = await listTokens(session.user.id);
  return NextResponse.json({ tokens, max: MAX_TOKENS_PER_USER });
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Days until expiry; omit or 0 for a non-expiring token. */
  expiresInDays: z.number().int().min(0).max(365).optional(),
});

/** POST — mint a token. The plaintext is in the response exactly once. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const limited = limitOr429(session.user.id, "write");
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }
  const active = await countActiveTokens(session.user.id);
  if (active >= MAX_TOKENS_PER_USER) {
    return NextResponse.json(
      { category: "validation", message: `Token limit reached (${MAX_TOKENS_PER_USER}). Revoke one first.` },
      { status: 400 },
    );
  }
  const days = parsed.data.expiresInDays ?? 0;
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
  const created = await createToken(session.user.id, parsed.data.name, expiresAt);
  return NextResponse.json(created, { status: 201 });
}
