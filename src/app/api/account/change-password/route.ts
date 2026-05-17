import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { compare as bcryptCompare, hash as bcryptHash } from "bcryptjs";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { checkSignupRate } from "@/server/proxy/ratelimit";
import { clientIp } from "@/server/security/client-ip";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/account/change-password
 *
 * Lets a signed-in user proactively rotate their password. Requires
 * the current password to prevent a hijacked session from locking
 * out the owner. New password must be ≥12 chars to match the signup
 * + reset minimums.
 *
 * For OAuth-only users (no `passwordHash`), returns 409 - they
 * can't set a credentials password from this endpoint.
 *
 * Rate-limited per (ip + userId) so a leaked session can't grind
 * brute-force against the current-password check.
 */
const BodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

const BCRYPT_COST = 12;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const ip = clientIp(req);
  const limit = checkSignupRate(`pwchg:${ip}:${userId}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { category: "rate_limited", message: "Too many attempts. Wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
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
      {
        category: "validation",
        message: parsed.error.issues[0]?.message ?? "Invalid input.",
        field: parsed.error.issues[0]?.path?.[0],
      },
      { status: 400 },
    );
  }

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const hash = rows[0]?.passwordHash;
  if (!hash) {
    return NextResponse.json(
      {
        category: "no_password",
        message:
          "This account signs in via OAuth, so password changes aren't supported here.",
      },
      { status: 409 },
    );
  }
  const valid = await bcryptCompare(parsed.data.currentPassword, hash);
  if (!valid) {
    return NextResponse.json(
      { category: "bad_password", message: "The current password didn't match." },
      { status: 400 },
    );
  }

  try {
    const newHash = await bcryptHash(parsed.data.newPassword, BCRYPT_COST);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
    log.info("password changed", { userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("change-password failed", { userId, err: (e as Error).message });
    return NextResponse.json(
      { category: "server", message: "Could not change password." },
      { status: 500 },
    );
  }
}
