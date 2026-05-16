"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock, CreditCard, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/ui/cn";

interface PlanCatalogEntry {
  plan: "free" | "hosted" | "team";
  label: string;
  description: string;
  monthlyPriceCents: number;
  /** null === unlimited. */
  maxConnections: number | null;
  canInviteTeam: boolean;
  trialDays: number;
}

export interface ActivePlanProps {
  plan: "free" | "hosted" | "team";
  status: string;
  isPaid: boolean;
  isTrialing: boolean;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  grantedByAdmin: boolean;
}

interface Props {
  email: string;
  active: ActivePlanProps;
  catalog: PlanCatalogEntry[];
  billingConfigured: boolean;
  flashStatus: "success" | "cancelled" | null;
}

/**
 * Customer-facing billing page. Shows the current plan, an upgrade
 * CTA when on Free, and a renewal/trial cliff when on Hosted. Real
 * billing details (cancel, update card, invoices) live on Dodo's
 * customer flow — when paid, we link out instead of duplicating
 * forms in-app.
 */
export function BillingPanel({ email, active, catalog, billingConfigured, flashStatus }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `Checkout failed (${res.status}).`);
        return;
      }
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setError("Checkout returned no URL.");
    } catch (e) {
      setError((e as Error).message ?? "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Billing & plan</h1>
        <p className="text-sm text-fg-muted">
          Signed in as <span className="font-mono text-fg">{email}</span>.
        </p>
      </header>

      {flashStatus === "success" && (
        <FlashBanner
          tone="success"
          icon={CheckCircle2}
          title="Checkout complete"
          body="Your subscription will activate once Dodo confirms the payment — usually within a few seconds."
        />
      )}
      {flashStatus === "cancelled" && (
        <FlashBanner
          tone="muted"
          icon={Clock}
          title="Checkout cancelled"
          body="No charge was made. You can upgrade any time from this page."
        />
      )}

      {!billingConfigured && (
        <FlashBanner
          tone="warn"
          icon={ShieldAlert}
          title="Billing isn't configured on this deployment"
          body="The operator hasn't connected a Dodo Payments key yet. The free tier still works."
        />
      )}

      <CurrentPlanCard active={active} />

      {error && (
        <div className="rounded border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Plans</h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {catalog.map((entry) => {
            // A cancelled/expired Hosted plan still has plan="hosted"
            // in the row but the resolver downgrades to Free entitlement.
            // We want "Current plan" to track the *entitled* plan and
            // expose a Resubscribe CTA for lapsed customers.
            const isCurrent = entry.plan === active.plan && active.isPaid;
            const isUpgrade =
              entry.plan === "hosted" && !active.isPaid;
            return (
              <li key={entry.plan} className="flex">
                <article
                  className={cn(
                    "flex w-full flex-col gap-3 rounded-lg border p-5",
                    isCurrent ? "border-accent bg-accent/5" : "hairline bg-bg-raised",
                  )}
                >
                  <div className="space-y-1">
                    <h3 className="font-display text-base">{entry.label}</h3>
                    <p className="text-xs leading-relaxed text-fg-muted">
                      {entry.description}
                    </p>
                  </div>
                  <p className="font-mono text-2xl">
                    {entry.monthlyPriceCents > 0
                      ? `$${(entry.monthlyPriceCents / 100).toFixed(0)}`
                      : entry.plan === "team"
                      ? "Custom"
                      : "$0"}
                    {entry.monthlyPriceCents > 0 && (
                      <span className="ml-1 text-xs text-fg-faint">/user/mo</span>
                    )}
                  </p>
                  <ul className="space-y-1.5 text-xs text-fg-muted">
                    <Bullet
                      label={
                        entry.maxConnections === null
                          ? "Unlimited connections"
                          : `${entry.maxConnections} connection${entry.maxConnections === 1 ? "" : "s"}`
                      }
                    />
                    <Bullet label={entry.canInviteTeam ? "Team workspace" : "Solo workspace"} />
                    <Bullet
                      label={
                        entry.trialDays > 0
                          ? `${entry.trialDays}-day free trial`
                          : entry.plan === "team"
                          ? "SSO + dedicated infra"
                          : "No credit card"
                      }
                    />
                  </ul>
                  <div className="mt-auto pt-2">
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 text-[11px] font-mono text-accent">
                        <CheckCircle2 className="h-3 w-3" aria-hidden /> Current plan
                      </span>
                    ) : isUpgrade ? (
                      <button
                        type="button"
                        onClick={startCheckout}
                        disabled={loading || !billingConfigured}
                        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loading
                          ? "Opening Dodo…"
                          : isLapsed(active)
                          ? "Resubscribe"
                          : entry.trialDays > 0
                          ? `Start ${entry.trialDays}-day trial`
                          : "Subscribe"}
                        {!loading && <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                      </button>
                    ) : entry.plan === "team" ? (
                      <a
                        href="mailto:hello@suparbase.com?subject=Team plan inquiry"
                        className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border hairline px-3 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
                      >
                        Contact sales
                        <ArrowUpRight className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      <span className="block text-[11px] text-fg-faint">—</span>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-md border hairline bg-bg-raised/40 p-4 text-xs text-fg-muted">
        <p className="flex items-start gap-2">
          <CreditCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span>
            Payments are processed by{" "}
            <a href="https://dodopayments.com" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
              Dodo Payments
            </a>{" "}
            (Merchant of Record). To change your card, cancel, or download an invoice, follow the
            link in the receipt email. Questions? <a href="mailto:hello@suparbase.com" className="text-accent hover:underline">hello@suparbase.com</a>.
          </span>
        </p>
      </section>
    </div>
  );
}

/**
 * Map raw status enum to human-readable copy. The internal names
 * (active / on_hold / cancelled / failed / expired) leak engineering
 * jargon to paying customers; the labels here are what the user sees.
 */
function statusLabel(active: ActivePlanProps): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (active.isTrialing) return { label: "Trialing", tone: "ok" };
  if (active.isPaid) return { label: "Active", tone: "ok" };
  switch (active.status) {
    case "on_hold":
      return { label: "Paused — payment issue", tone: "warn" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    case "failed":
      return { label: "Past due", tone: "danger" };
    default:
      return { label: "—", tone: "neutral" };
  }
}

function isLapsed(active: ActivePlanProps): boolean {
  return (
    !active.isPaid &&
    (active.status === "cancelled" ||
      active.status === "expired" ||
      active.status === "on_hold" ||
      active.status === "failed")
  );
}

function CurrentPlanCard({ active }: { active: ActivePlanProps }) {
  const cliff = active.currentPeriodEnd
    ? new Date(active.currentPeriodEnd)
    : active.trialEndsAt
    ? new Date(active.trialEndsAt)
    : null;
  const cliffLabel = cliff ? formatDate(cliff) : null;
  const status = statusLabel(active);

  // Pick the correct date label based on status — saying "Renews" for
  // a cancelled subscription is misleading.
  const cliffHeading = active.isTrialing
    ? "Trial ends"
    : active.status === "cancelled" || active.status === "expired"
    ? "Ended"
    : "Renews";

  const statusToneCls =
    status.tone === "ok"
      ? "text-accent"
      : status.tone === "warn"
      ? "text-amber-400"
      : status.tone === "danger"
      ? "text-danger"
      : "text-fg";

  return (
    <section className="rounded-lg border hairline bg-bg-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-fg-faint">Current plan</p>
          <h2 className="font-display text-xl">
            {active.isPaid && active.plan === "hosted"
              ? "Hosted"
              : active.isPaid && active.plan === "team"
              ? "Team"
              : "Free"}
          </h2>
          <p className="text-xs text-fg-muted">
            Status: <span className={statusToneCls}>{status.label}</span>
            {active.grantedByAdmin && <span className="ml-2 text-fg-faint">· Admin grant</span>}
          </p>
        </div>
        {cliffLabel && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-fg-faint">{cliffHeading}</p>
            <p className="font-mono text-sm">{cliffLabel}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function FlashBanner({
  tone,
  icon: Icon,
  title,
  body,
}: {
  tone: "success" | "muted" | "warn";
  icon: typeof CheckCircle2;
  title: string;
  body: string;
}) {
  const cls =
    tone === "success"
      ? "border-accent/40 bg-accent/10"
      : tone === "warn"
      ? "border-amber-500/40 bg-amber-500/10"
      : "border-line bg-bg-raised/40";
  return (
    <div className={cn("flex items-start gap-3 rounded-md border p-3 text-sm", cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div>
        <p className="font-medium text-fg">{title}</p>
        <p className="text-xs text-fg-muted">{body}</p>
      </div>
    </div>
  );
}

function Bullet({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-1.5">
      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
      <span>{label}</span>
    </li>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
