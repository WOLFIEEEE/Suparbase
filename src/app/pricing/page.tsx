import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Github, HelpCircle, Lock, Server } from "lucide-react";
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
    "Suparbase is free to self-host (MIT) and has a hosted plan for teams who'd rather not run their own infra.",
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
    name: "Self-host",
    price: "Free",
    cadence: "forever",
    blurb:
      "Clone the repo, point it at a Postgres database, and run it on Coolify, Vercel, Fly, Railway, or any Node host.",
    cta: { label: "Open the repo", href: "https://github.com/WOLFIEEEE/Suparbase" },
    features: [
      { text: "Every feature on this site" },
      { text: "Unlimited connections" },
      { text: "Unlimited users (you own the auth table)" },
      { text: "AES-256-GCM credential vault" },
      { text: "BYO OpenRouter key for AI chat" },
      { text: "BYO Postgres URL for SQL playground / RLS debugger" },
      { text: "MIT licensed" },
    ],
    note: "You run the host. You own the data.",
  },
  {
    name: "Hosted",
    price: "$12",
    cadence: "per user / month",
    blurb:
      "Same Suparbase, managed by us. Patched in lockstep with the open-source release, with credentials in our encrypted vault.",
    cta: { label: "Get started", href: "/signup" },
    highlight: true,
    badge: "Most popular",
    features: [
      { text: "Everything in Self-host" },
      { text: "Hosted Postgres for sessions + audit log" },
      { text: "Background workers (long-running exports, imports)" },
      { text: "Email support, 1 business day" },
      { text: "Per-org rate limits + role-based access (Q3 roadmap)" },
      { text: "Audit log retention beyond 90 days (Q3 roadmap)", muted: true },
    ],
    note: "Free 14-day trial. No credit card.",
  },
  {
    name: "Team",
    price: "Custom",
    blurb:
      "For larger teams that need SSO, dedicated infrastructure, or a private build. Talk to us about what you actually need.",
    cta: { label: "Contact sales", href: "mailto:hello@suparbase.dev" },
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
    q: "Is the self-host version really the full product?",
    a: "Yes. Every feature you see on the website is in the public repo. Hosted exists for teams who don't want to operate the infra themselves.",
  },
  {
    q: "Will my Supabase keys ever touch a browser?",
    a: "No. Keys are AES-256-GCM encrypted before they hit the database and decrypted only inside the server-side proxy. The browser only ever holds a session cookie.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "On the hosted plan you can export everything (connections, audit log, saved views) as JSON from your account page. We hard-delete your row 30 days after cancellation.",
  },
  {
    q: "Why per-seat pricing for hosted?",
    a: "Most of our cost scales with active humans, not requests. Per-seat keeps it simple, predictable, and stays cheaper than every other Supabase admin tool we've seen.",
  },
  {
    q: "What does \"BYO OpenRouter key\" mean?",
    a: "You bring your own OpenRouter API key. We never proxy token spend, so AI usage doesn't show up on your Suparbase bill. Self-host or hosted, same model.",
  },
  {
    q: "Can I upgrade or downgrade later?",
    a: "Anytime. Prorated within the month, no contracts on Hosted.",
  },
] as const;

export default async function PricingPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Pricing"
          title={
            <>
              Free if you self-host.
              <br className="hidden sm:inline" /> Reasonable if you don&apos;t.
            </>
          }
          subtitle="Suparbase is open-source under MIT. The hosted plan covers the cost of running it for teams who'd rather not."
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
              <Server className="h-3 w-3 text-accent" aria-hidden /> All tiers, same features
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Github className="h-3 w-3 text-accent" aria-hidden /> Patched in lockstep with the repo
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
        title="14 days free on hosted. Forever free if you self-host."
        body="Either way, you're five minutes from your first connection."
        primary={{ href: "/signup", label: "Start free trial" }}
        secondary={{ href: "/docs#self-host", label: "Self-host guide" }}
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
