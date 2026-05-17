import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";
import { GuestCheckoutForm } from "@/components/checkout/GuestCheckoutForm";
import { PLAN_LIMITS } from "@/server/billing/plans";
import { readDodoConfig } from "@/server/billing/dodo";
import { auth } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Subscribe · Suparbase",
  description:
    "Subscribe to Suparbase without creating an account first. Email + payment, set a password after.",
  robots: { index: false, follow: true },
};

interface Params {
  plan: string;
}

interface SearchParams {
  cadence?: string;
  cancelled?: string;
}

// Plans that support guest checkout. Free routes to /signup; Team
// routes to /contact?topic=sales - neither needs Dodo checkout here.
const GUEST_CHECKOUT_PLANS = ["hosted"] as const;
type GuestPlan = (typeof GUEST_CHECKOUT_PLANS)[number];

function isGuestPlan(plan: string): plan is GuestPlan {
  return (GUEST_CHECKOUT_PLANS as readonly string[]).includes(plan);
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

const FEATURE_HIGHLIGHTS: Record<GuestPlan, string[]> = {
  hosted: [
    "Unlimited Supabase connections",
    "Team workspace (editor / viewer roles)",
    "90-day audit log retention",
    "Agent Sentry continuous scans",
    "Background workers for long exports / imports",
    "Email support, 1 business day",
  ],
};

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { plan } = await params;
  const sp = await searchParams;

  if (!isGuestPlan(plan)) {
    // Free → /signup, Team → /contact, unknown → 404.
    if (plan === "free") redirect("/signup");
    if (plan === "team") redirect("/contact?topic=sales");
    notFound();
  }

  // If they're already signed in, the in-app flow is better - it
  // can use their session and pre-fill the customer record.
  const session = await auth();
  if (session?.user) {
    redirect("/settings/billing");
  }

  const limits = PLAN_LIMITS[plan];
  const config = readDodoConfig();
  const billingConfigured = config !== null;
  const annualSupported = !!config?.hostedAnnualProductId;

  const requestedCadence =
    sp.cadence === "annual" && annualSupported ? "annual" : "monthly";
  const cancelled = sp.cancelled === "1";

  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow={`Suparbase ${limits.label}`}
          title="One step to your subscription."
          subtitle="Pay first, set a password after. Your account waits for you on the success page."
        />

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_18rem]">
          <div className="min-w-0">
            {!billingConfigured ? (
              <div
                role="alert"
                className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
              >
                <strong className="font-medium">Billing isn&rsquo;t configured</strong>{" "}
                on this deployment yet. Reach out via{" "}
                <Link href="/contact?topic=sales" className="underline">
                  our contact form
                </Link>{" "}
                and we&rsquo;ll get you set up.
              </div>
            ) : (
              <GuestCheckoutForm
                plan={plan}
                initialCadence={requestedCadence}
                cancelled={cancelled}
                pricing={{
                  label: limits.label,
                  monthlyPriceFormatted: formatPrice(limits.monthlyPriceCents),
                  annualPriceFormatted:
                    limits.annualPriceCents > 0
                      ? formatPrice(limits.annualPriceCents)
                      : formatPrice(limits.monthlyPriceCents * 12),
                  annualSupported,
                  trialDays: limits.trialDays,
                }}
              />
            )}
          </div>

          <aside className="space-y-5 text-sm">
            <div className="rounded-lg border hairline bg-bg-raised/40 p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
                What you get
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-fg-muted">
                {FEATURE_HIGHLIGHTS[plan].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border hairline bg-bg-raised/40 p-4 text-xs text-fg-muted">
              <p className="text-fg">No-friction signup</p>
              <p className="mt-2">
                You don&rsquo;t need an account before paying. After Dodo confirms
                the payment, we&rsquo;ll drop you onto a page where you pick a
                password and you&rsquo;re in.
              </p>
              <p className="mt-2">
                Prefer the other order?{" "}
                <Link href="/signup" className="text-accent hover:underline">
                  Create a free account first
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
