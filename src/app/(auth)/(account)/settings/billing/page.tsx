import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/server/auth";
import { getSubscription } from "@/server/billing/repo";
import { resolvePlan, PLAN_LIMITS } from "@/server/billing/plans";
import { isBillingConfigured } from "@/server/billing/dodo";
import { BillingPanel } from "@/components/settings/BillingPanel";

export const metadata: Metadata = {
  title: "Billing · Suparbase",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function BillingSettingsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const userId = session.user.id;
  const email = session.user.email ?? "";

  const row = await getSubscription(userId);
  const active = resolvePlan(row);
  const billingConfigured = isBillingConfigured();
  const params = await searchParams;
  const flashStatus = params?.status === "success" || params?.status === "cancelled"
    ? params.status
    : null;

  // Surface every plan in the catalog so the user can compare what
  // they have vs what's available — even Team, which is custom.
  const catalog = Object.entries(PLAN_LIMITS).map(([plan, limits]) => ({
    plan: plan as keyof typeof PLAN_LIMITS,
    ...limits,
  }));

  return (
    <BillingPanel
      email={email}
      active={{
        plan: active.plan,
        status: active.status,
        isPaid: active.isPaid,
        isTrialing: active.isTrialing,
        currentPeriodEnd: active.currentPeriodEnd?.toISOString() ?? null,
        trialEndsAt: active.trialEndsAt?.toISOString() ?? null,
        grantedByAdmin: active.grantedByAdmin,
      }}
      catalog={catalog}
      billingConfigured={billingConfigured}
      flashStatus={flashStatus}
    />
  );
}

void notFound;
