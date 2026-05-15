import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  History,
  Lock,
  Pencil,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquareCode,
  Undo2,
} from "lucide-react";
import { auth } from "@/server/auth";
import { LandingHero } from "@/components/landing/LandingHero";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, FeatureCard, SectionHeading } from "@/components/public/sections";
import { SITE } from "@/lib/seo/site";

const STEPS = [
  {
    k: "01",
    title: "Sign in once",
    body: "Email + password, or GitHub OAuth when the operator has enabled it. Your account holds every project you save.",
  },
  {
    k: "02",
    title: "Save your project",
    body: "Paste a Supabase URL + API key. We encrypt it with AES-256-GCM before the row is committed: the plaintext key never lives on disk.",
  },
  {
    k: "03",
    title: "Use a working admin",
    body: "Row cards, type-aware forms, FK lookups, bulk operations, CSV/JSON in + out, undoable deletes: all proxied server-side. Your key never reaches the browser.",
  },
] as const;

const PROMISES = [
  "API keys are AES-256-GCM encrypted at rest. The plaintext never persists to disk.",
  "Every PostgREST call is proxied through an authenticated route. The browser holds only a session cookie.",
  "Every write hits an audit log keyed to your account, connection, table, primary key, and verb.",
  "JWT-shaped substrings and provider keys are defensively redacted before any log line is written.",
  "Self-hostable on Coolify or any docker-compose host with zero env vars typed.",
] as const;

const FEATURE_PREVIEWS = [
  {
    icon: Sparkles,
    title: "AI chat with tool-use",
    body: "Ask a question; the agent lists tables, inspects schemas, runs filtered reads, and drafts writes you confirm in a diff card.",
  },
  {
    icon: SquareCode,
    title: "SQL playground",
    body: "Raw SQL with read-only by default. Statement timeout, EXPLAIN, and a Recent dropdown backed by localStorage.",
  },
  {
    icon: ShieldCheck,
    title: "RLS debugger",
    body: "Browse pg_policies, then simulate SELECT/INSERT/UPDATE/DELETE as any role with custom JWT claims. All rolled back.",
  },
  {
    icon: Pencil,
    title: "Inline cell editing",
    body: "Click any value on a row detail page to edit it in place. Enter to commit, Escape to cancel.",
  },
  {
    icon: History,
    title: "Per-row history",
    body: "Every write captures a before/after snapshot. The detail page shows a chronological column-level diff timeline.",
  },
  {
    icon: Search,
    title: "Global Cmd-K search",
    body: "Type an email or UUID; the palette scans every table in parallel and links straight to the row.",
  },
] as const;

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/connections");

  return (
    <PublicLayout>
      <div className="relative overflow-hidden">
        {/* Subtle grid backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgb(var(--fg)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--fg)) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        {/* Accent glow, top-right */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-[44rem] w-[44rem] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgb(var(--accent) / 0.18), rgb(var(--accent) / 0) 70%)",
          }}
        />

        <div className="relative mx-auto w-full max-w-6xl px-6">
          <div className="py-12 md:py-16">
            <LandingHero />
          </div>

          {/* Agent Sentry CTA banner — the v3 differentiator */}
          <SentryBanner />

          {/* Three-step explainer */}
          <section className="grid grid-cols-1 gap-y-8 py-10 md:grid-cols-[auto_1fr] md:gap-x-12 md:py-16">
            <div className="md:pt-1">
              <div className="text-[10px] uppercase tracking-[0.22em] text-fg-faint">How it works</div>
              <h2 className="mt-2 font-display text-2xl leading-tight md:text-3xl">
                Three steps,
                <br />
                no ceremony.
              </h2>
            </div>
            <ol className="space-y-7">
              {STEPS.map((s) => (
                <li key={s.k} className="flex gap-4">
                  <span
                    aria-hidden
                    className="select-none font-mono text-[11px] uppercase tracking-wider text-accent"
                  >
                    {s.k}
                  </span>
                  <div className="flex-1 space-y-1.5 border-l hairline pl-5">
                    <h3 className="font-display text-lg leading-tight">{s.title}</h3>
                    <p className="max-w-2xl text-sm text-fg-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Feature preview grid */}
        <section className="border-t hairline bg-bg-raised/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
            <SectionHeading
              eyebrow="What you get"
              title="A working admin, not a wrapper."
              subtitle="Every feature below ships today. None of them are coming soon."
            />
            <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_PREVIEWS.map((f) => (
                <li key={f.title}>
                  <FeatureCard {...f} tone="accent" />
                </li>
              ))}
            </ul>
            <div className="mt-8 flex justify-center">
              <Link
                href="/features"
                className="inline-flex h-10 items-center gap-1.5 rounded-md border hairline px-4 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                See all features <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* Security & operability section */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 md:py-24">
          <div className="surface rounded-lg p-6 sm:p-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[18rem_1fr]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-fg-faint">Why server-side</div>
                <h2 className="mt-2 font-display text-2xl leading-tight">
                  The key never reaches the browser.
                </h2>
                <p className="mt-3 max-w-md text-sm text-fg-muted">
                  Suparbase exists because &quot;store the API key in localStorage&quot; was
                  always a foot-gun. Every promise below is checked by the
                  pre-merge gates in our open spec-kit.
                </p>
              </div>
              <ul className="space-y-3 text-sm text-fg-muted">
                {PROMISES.map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    <span className="leading-relaxed">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t hairline pt-5 text-sm">
              <Link
                href="/docs#security"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                <Lock className="h-3 w-3" aria-hidden /> Read the security model
              </Link>
              <span className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-fg-faint">
                <Database className="h-3 w-3" aria-hidden /> v{SITE.version}
              </span>
            </div>
          </div>
        </section>
      </div>

      <CTABand
        title="Drop in your key and ship."
        body="Five minutes to set up. Free to self-host. No credit card on the hosted plan."
        primary={{ href: "/signup", label: "Get started" }}
        secondary={{ href: "/features", label: "See features" }}
      />
    </PublicLayout>
  );
}

// ---------------------------------------------------------------------------
// Agent Sentry banner — sits between the hero and the three-step explainer.
// Compact, accent-coloured, hooks the v3 narrative without dragging out the
// page. Tap-target wraps the whole card on mobile.
// ---------------------------------------------------------------------------

function SentryBanner() {
  return (
    <section className="relative">
      <Link
        href="/agent-sentry"
        className="group block rounded-xl border hairline bg-bg-raised p-5 transition-colors hover:border-line-strong md:p-6"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-accent/10 via-transparent to-transparent opacity-60"
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="space-y-2 md:max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-fg-faint">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-accent">
                <Sparkles className="h-3 w-3" aria-hidden /> new · v3
              </span>
              Agent Sentry
            </div>
            <h2 className="font-display text-xl leading-tight md:text-2xl">
              Catch the next <span className="text-accent">Moltbook</span> before
              the headline. Undo the next <span className="text-accent">PocketOS</span>{" "}
              before lunch.
            </h2>
            <p className="text-sm leading-relaxed text-fg-muted">
              Continuous anon-key probe + per-AI-agent session attribution + one-click
              undo. Nothing else on the market combines all three.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border hairline bg-bg px-2.5 py-1 text-[11px] text-fg-muted">
                <ShieldAlert className="h-3 w-3 text-danger" aria-hidden />
                1.5M API keys leaked · Jan 2026
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border hairline bg-bg px-2.5 py-1 text-[11px] text-fg-muted">
                <AlertTriangle className="h-3 w-3 text-warn" aria-hidden />
                170 apps · Lovable CVE
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border hairline bg-bg px-2.5 py-1 text-[11px] text-fg-muted">
                <Undo2 className="h-3 w-3 text-accent" aria-hidden />
                9s to delete prod · Apr 2026
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform group-hover:scale-[1.02]">
              See how it works
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
