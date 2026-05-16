import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getSubscription } from "@/server/billing/repo";
import { createPortalSession, DodoError, readDodoConfig } from "@/server/billing/dodo";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/billing/portal
 *
 * Mint a Dodo customer-portal URL and return it. The client
 * navigates to the URL — that gives the customer access to manage
 * their payment method, cancel, or view invoices on Dodo's side.
 *
 * 404s when the user has no Dodo customer record yet (Free plan,
 * never started a checkout).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  }
  const sub = await getSubscription(session.user.id);
  if (!sub?.dodoCustomerId) {
    return NextResponse.json(
      {
        category: "not_found",
        message: "No billing account yet. Start a subscription first.",
      },
      { status: 404 },
    );
  }
  const config = readDodoConfig();
  if (!config) {
    return NextResponse.json(
      { category: "not_configured", message: "Billing isn't configured." },
      { status: 503 },
    );
  }
  try {
    const portal = await createPortalSession(config, sub.dodoCustomerId);
    if (!portal) {
      return NextResponse.json(
        {
          category: "server",
          message: "Dodo didn't return a portal URL. Check your receipt email instead.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    if (e instanceof DodoError) {
      log.warn("portal session failed", {
        userId: session.user.id,
        category: e.category,
        err: e.message,
      });
      return NextResponse.json(
        { category: e.category, message: e.message },
        { status: 502 },
      );
    }
    log.error("portal session unexpected", {
      userId: session.user.id,
      err: (e as Error).message,
    });
    return NextResponse.json(
      { category: "server", message: "Could not open the portal." },
      { status: 500 },
    );
  }
}
