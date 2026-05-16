import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { compare as bcryptCompare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { disable2FA } from "@/server/auth/totp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  /** Current password — required to disable 2FA, defends against
   *  session-hijack downgrades. */
  password: z.string().min(8).max(200),
});

/**
 * POST /api/account/2fa/disable
 *
 * Requires the user to re-enter their current password (defends
 * against a stolen session being used to weaken account security).
 * On success, clears the encrypted secret and all recovery codes.
 *
 * For OAuth-only users (no password), this endpoint returns 409 —
 * those users need to contact support to disable 2FA.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { category: "validation", message: "Body must be JSON." },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: "Invalid input." },
      { status: 400 },
    );
  }

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const hash = rows[0]?.passwordHash;
  if (!hash) {
    return NextResponse.json(
      {
        category: "no_password",
        message:
          "This account signs in via OAuth, so password-based disable isn't available. Email contact@suparbase.com.",
      },
      { status: 409 },
    );
  }
  const ok = await bcryptCompare(parsed.data.password, hash);
  if (!ok) {
    return NextResponse.json(
      { category: "bad_password", message: "That password doesn't match." },
      { status: 400 },
    );
  }
  await disable2FA(session.user.id);
  return NextResponse.json({ ok: true });
}
