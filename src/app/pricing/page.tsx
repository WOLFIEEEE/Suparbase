import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, HelpCircle, Lock, Server, Sparkles } from "lucide-react";
import { auth } from "@/server/auth";
import { PublicLayout } from "@/components/public/PublicLayout";
import {
  CTABand,
  PageHeader,
  PageShell,
  SectionHeading,
} from "@/components/public/sections";
import { cn } from "@/lib/ui/cn";

export const metadata: Metadata = {
  title: "Pricing · Suparbase",
  description:
    "Suparbase has a free hosted tier for individuals and paid plans for teams. Same encryption, same proxy, same features.",
  alternates: { canonical: "/pricing" },
};

interface Tier {
  name: string;
  price: string;
  cadence?: string;
  blurb: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
  features: Array<{ text: string; muted?: boolean }>;
  note?: string;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb:
      "For individuals running a few Supabase projects. Same encrypted proxy, same admin surface, just capped.",
    cta: { label: "Create free account", href: "/signup" },
    features: [
      { text: "Up to 3 Supabase connections" },
      { text: "Solo workspace (1 user)" },
      { text: "AES-256-GCM credential vault" },
      { text: "Full admin surface (data grid, schema view, audit log)" },
      { text: "BYO OpenRouter key for AI chat" },
      { text: "30-day audit log retention" },
    ],
    note: "No credit card. No time limit.",
  },
  {
    name: "Hosted",
    price: "$12",
    cadence: "per user / month",
    blurb:
      "For teams running real Supabase workloads. Unlimited connections, team workspace, longer retention, support.",
    cta: { label: "Start free trial", href: "/checkout/hosted" },
    highlight: true,
    badge: "Most popular",
    features: [
      { text: "Everything in Free" },
      { text: "Unlimited connections" },
      { text: "Team workspace (editor / viewer roles)" },
      { text: "Background workers (long-running exports, imports)" },
      { text: "90-day audit log retention" },
      { text: "Agent Sentry continuous scans" },
      { text: "Email support, 1 business day" },
    ],
    note: "7-day trial. Payment details are collected securely by Dodo Payments.",
  },
  {
    name: "Team",
    price: "Custom",
    blurb:
      "For larger teams that need SSO, dedicated infrastructure, or a private build. Talk to us about what you actually need.",
    cta: { label: "Contact sales", href: "/contact?topic=sales" },
    features: [
      { text: "Everything in Hosted" },
      { text: "SAML / OIDC SSO" },
      { text: "Single-tenant deployment (dedicated host)" },
      { text: "Custom data retention + DPA" },
      { text: "Priority support, same-day response" },
      { text: "Private feature roadmap input" },
    ],
  },
];

const FAQ = [
  {
    q: "Is the Free tier really free forever?",
    a: "Yes. Up to three connections, one user, no time limit, and no credit card. Upgrade to Hosted when you need a team or unlimited projects.",
  },
  {
    q: "Will my Supabase keys ever touch a browser?",
    a: "No. Keys are AES-256-GCM encrypted before they hit the database and decrypted only inside the server-side proxy. The browser only ever holds a session cookie.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Cancelling billing does not delete your account. You keep access through the paid period and then return to Free limits. Export or separately schedule account deletion from account settings at any time.",
  },
  {
    q: "Why per-seat pricing for Hosted?",
    a: "Most of our cost scales with active humans, not requests. Per-seat keeps it simple, predictable, and stays cheaper than every other Supabase admin tool we've seen.",
  },
  {
    q: "What does \"BYO OpenRouter key\" mean?",
    a: "You bring your own OpenRouter API key. We never proxy token spend, so AI usage doesn't show up on your Suparbase bill. Same model on every tier.",
  },
  {
    q: "Can I upgrade or downgrade later?",
    a: "Anytime. Plan and payment-method changes are managed securely in the Dodo customer portal. Cancellation takes effect under the billing terms shown there; there are no long-term Hosted contracts.",
  },
] as const;

export default async function PricingPage() {
  // Signed-in users already have an account - sending them to the
  // marketing pricing page makes no sense. /settings/billing has
  // the same plan table plus their current state + upgrade CTA.
  const session = await auth();
  if (session?.user) redirect("/settings/billing");

  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Pricing"
          title={
            <>
              Free for individuals.
              <br className="hidden sm:inline" /> Reasonable for teams.
            </>
          }
          subtitle="A free hosted tier for solo projects, paid plans when your team needs unlimited connections, SSO, and longer retention."
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-20">
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {TIERS.map((t) => (
              <li key={t.name} className="flex">
                <PricingCard tier={t} />
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-accent" aria-hidden /> All tiers, same encryption
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Server className="h-3 w-3 text-accent" aria-hidden /> All tiers, same admin surface
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-accent" aria-hidden /> Free tier never expires
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-3xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="FAQ"
            title="Things people ask before they pay"
            align="center"
          />
          <dl className="mt-10 space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-lg border hairline bg-bg-raised p-5 transition-colors open:bg-bg-raised/90"
              >
                <summary className="flex cursor-pointer list-none items-start gap-3 text-sm font-medium text-fg">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="flex-1">{item.q}</span>
                  <span
                    aria-hidden
                    className="ml-2 select-none font-mono text-[10px] text-fg-faint transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 pl-7 text-sm leading-relaxed text-fg-muted">{item.a}</p>
              </details>
            ))}
          </dl>
        </div>
      </section>

      <CTABand
        title="Free for solo work. A 7-day Hosted trial for teams."
        body="Either way, you're five minutes from your first connection."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/docs", label: "Read the docs" }}
      />
    </PublicLayout>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  const external = tier.cta.href.startsWith("http") || tier.cta.href.startsWith("mailto:");
  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-lg border bg-bg-raised p-6",
        tier.highlight ? "border-accent shadow-lg" : "hairline",
      )}
    >
      {tier.badge && (
        <span className="absolute -top-3 right-5 rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-accent-fg">
          {tier.badge}
        </span>
      )}
      <header className="space-y-2">
        <h3 className="font-display text-xl leading-tight">{tier.name}</h3>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-3xl">{tier.price}</span>
          {tier.cadence && (
            <span className="text-[11px] text-fg-faint">{tier.cadence}</span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-fg-muted">{tier.blurb}</p>
      </header>
      <ul className="mt-6 flex-1 space-y-2.5 text-sm">
        {tier.features.map((f) => (
          <li
            key={f.text}
            className={cn(
              "flex items-start gap-2.5",
              f.muted ? "text-fg-faint" : "text-fg-muted",
            )}
          >
            <Check
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                f.muted ? "text-fg-faint" : "text-accent",
              )}
              aria-hidden
            />
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
      {tier.note && (
        <p className="mt-5 text-[11px] text-fg-faint">{tier.note}</p>
      )}
      <div className="mt-5">
        {external ? (
          <a
            href={tier.cta.href}
            target={tier.cta.href.startsWith("http") ? "_blank" : undefined}
            rel={tier.cta.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
              tier.highlight
                ? "bg-accent text-accent-fg hover:bg-accent/90"
                : "border hairline text-fg hover:border-line-strong",
            )}
          >
            {tier.cta.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : (
          <Link
            href={tier.cta.href}
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
              tier.highlight
                ? "bg-accent text-accent-fg hover:bg-accent/90"
                : "border hairline text-fg hover:border-line-strong",
            )}
          >
            {tier.cta.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </article>
  );
}
