import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { eq } from "drizzle-orm";
import { createCheckout, DodoError, readDodoConfig } from "@/server/billing/dodo";
import { getActivePlan } from "@/server/billing/repo";
import { PLAN_LIMITS } from "@/server/billing/plans";
import { limitOr429 } from "@/server/security/route-guards";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/billing/checkout
 *
 * Kicks off a Dodo Payments checkout session for the Hosted plan.
 * Returns `{ checkoutUrl }`; the client navigates to it.
 *
 * Idempotent enough: if the caller already has an active/trialing
 * subscription, we return 409 with a pointer to /settings/billing
 * rather than create a second checkout.
 */
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const email = session.user.email;
  if (!userId || !email) {
    return NextResponse.json(
      { category: "validation", message: "Account is missing an email." },
      { status: 400 },
    );
  }

  // Cheap rate-limit so an obvious bot can't spam the Dodo API on our dime.
  const limited = limitOr429(userId, "write");
  if (limited) return limited;

  const config = readDodoConfig();
  if (!config) {
    return NextResponse.json(
      {
        category: "not_configured",
        message: "Billing isn't configured on this deployment.",
      },
      { status: 503 },
    );
  }

  const active = await getActivePlan(userId);
  if (active.isPaid) {
    return NextResponse.json(
      {
        category: "already_subscribed",
        message: "You already have an active subscription.",
        plan: active.plan,
      },
      { status: 409 },
    );
  }

  // Pick up the user's display name if we have one, else the email
  // local-part — Dodo requires a customer object.
  const userRows = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const displayName = userRows[0]?.name ?? email.split("@")[0]!;

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000";

  try {
    const result = await createCheckout({
      config,
      productId: config.hostedProductId,
      trialPeriodDays: PLAN_LIMITS.hosted.trialDays,
      customer: { email, name: displayName },
      metadata: { user_id: userId },
      returnUrl: `${origin}/api/billing/return?status=success`,
      cancelUrl: `${origin}/api/billing/return?status=cancelled`,
    });
    return NextResponse.json({ checkoutUrl: result.checkoutUrl });
  } catch (e) {
    if (e instanceof DodoError) {
      log.warn("checkout failure", {
        userId,
        category: e.category,
        err: e.message,
      });
      const status =
        e.category === "unauthorized"
          ? 502
          : e.category === "validation"
          ? 422
          : e.category === "network"
          ? 502
          : 500;
      return NextResponse.json(
        {
          category: e.category,
          message: e.category === "unauthorized" ? "Billing is misconfigured." : e.message,
        },
        { status },
      );
    }
    log.error("checkout unexpected", { userId, err: (e as Error).message });
    return NextResponse.json(
      { category: "server", message: "Could not start checkout." },
      { status: 500 },
    );
  }
}
