import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { disable2FA } from "@/server/auth/totp";
import { verifyPassword } from "@/server/auth/passwords";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  /** Current password - required to disable 2FA, defends against
   *  session-hijack downgrades. */
  password: z.string().max(200).optional(),
});

/**
 * POST /api/account/2fa/disable
 *
 * Credentials users re-enter their current password. OAuth users
 * must have authenticated in the last 10 minutes. Both checks defend
 * against a stale or stolen session being used to weaken security.
 * On success, clears the encrypted secret and all recovery codes.
 *
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
  if (hash) {
    const ok = await verifyPassword(parsed.data.password ?? "", hash);
    if (!ok) {
      return NextResponse.json(
        { category: "bad_password", message: "Enter your current password to disable 2FA." },
        { status: 400 },
      );
    }
  } else if (Date.now() - (session.user.authAt ?? 0) > 10 * 60_000) {
    return NextResponse.json(
      {
        category: "reauth_required",
        message: "Sign out and sign back in with GitHub before disabling 2FA.",
      },
      { status: 403 },
    );
  }
  await disable2FA(session.user.id);
  return NextResponse.json({ ok: true });
}
