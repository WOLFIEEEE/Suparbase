import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { userSettings } from "@/server/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Permanently hides the getting-started checklist for this account. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  await db
    .insert(userSettings)
    .values({ userId: session.user.id, onboardingDismissedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { onboardingDismissedAt: now, updatedAt: now },
    });
  return NextResponse.json({ ok: true });
}
