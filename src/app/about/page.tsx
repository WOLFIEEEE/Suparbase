import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Code2, FileText, GitMerge, Heart, ShieldCheck, Sparkles } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell, Prose, SectionHeading } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "About · Suparbase",
  description:
    "Suparbase is a single-author project built with a spec-kit workflow. Every feature lives in a markdown spec; every release maps to a git tag.",
};

const STACK = [
  { name: "Next.js 15", role: "App-router framework + route handlers" },
  { name: "Drizzle ORM", role: "Schema, migrations, queries" },
  { name: "Postgres", role: "Sessions, connections, audit log, analysis cache" },
  { name: "NextAuth v5", role: "Email + password and GitHub OAuth" },
  { name: "Tailwind CSS", role: "Styling, with a hairline-driven design system" },
  { name: "Radix Primitives", role: "Dialog, Popover, Dropdown, Tooltip, Tabs" },
  { name: "TanStack Query", role: "Client cache for schema + rows" },
  { name: "postgres-js", role: "Direct Postgres for RLS debugger + SQL playground" },
  { name: "OpenRouter", role: "AI chat + schema analysis (BYO key)" },
] as const;

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "The key never reaches the browser.",
    body:
      "Every PostgREST call is proxied through an authenticated route handler. Keys are AES-256-GCM encrypted at rest. The browser holds only a session cookie.",
  },
  {
    icon: Code2,
    title: "Specs before code.",
    body:
      "Every feature has a markdown spec under specs/ that's committed alongside the implementation. The spec carries the design notes and the constraints; the code is the realisation.",
  },
  {
    icon: GitMerge,
    title: "One feature, one commit.",
    body:
      "Releases bundle features but each feature is its own atomic commit. Anything can be reverted independently without disturbing the rest.",
  },
  {
    icon: Sparkles,
    title: "AI assists; humans commit.",
    body:
      "The AI chat can draft writes, but every change to the user's data goes through an explicit Apply click in the UI. The server re-validates after the user confirms.",
  },
] as const;

export default async function AboutPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="About"
          title={
            <>
              Built one feature at a time,
              <br className="hidden sm:inline" /> with the specs in the repo.
            </>
          }
          subtitle="Suparbase is a single-author project. Every feature is a spec-kit markdown file committed alongside the code. Every release is a git tag. There is no roadmap deck. There is no quarterly OKR. There is just the next spec."
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Story"
            title="Why this exists"
          />
          <div className="mt-8 max-w-3xl">
            <Prose>
              <p>
                Suparbase started as a frustration. Every Supabase admin tool I'd tried either stored the API key in
                localStorage (foot-gun), required a separate password manager (friction), or shipped only the table
                browser (no RLS debugging, no audit, no AI). I wanted one workspace that did the obvious thing:
                authenticated, server-side, encrypted, with the affordances of a real product.
              </p>
              <p>
                Twenty-plus specs later, here we are. The product ships an SQL playground, RLS debugger, AI write
                actions with diff cards, row history, storage browser, auth users with session inspector, custom
                actions, connection dashboards, team workspace, inline cell editing, global search, and seven
                archetype list views (Users, Content, Logs, Commerce, Tasks, Messages, plus a Generic fallback).
                Every one of these lives in <code>specs/0XX-name/spec.md</code>.
              </p>
              <p>
                The product is opinionated where being opinionated saves the user time: archetype detection picks the
                right detail view automatically, the AI agent has narrow tools so it can't fabricate columns, and
                writes always go through an audit log. Where opinion gets in the way: the SQL playground is one toggle
                away from write-mode and the RLS simulator runs raw SQL, both with the appropriate safety rails.
              </p>
            </Prose>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Principles"
            title="Four rules that decide every PR"
          />
          <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-lg border hairline bg-bg-raised p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border-accent/40 bg-accent/10">
                    <Icon className="h-4 w-4 text-accent" aria-hidden />
                  </span>
                  <h3 className="font-display text-base leading-tight">{title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-3xl text-sm text-fg-muted">
            The full Constitution lives at <code>.specify/memory/constitution.md</code> in the repo. It's terser than
            most: nine principles, each one a single paragraph, each one cited by spec PRs that touch the relevant
            surface.
          </p>
        </div>
      </section>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Stack"
            title="What it's built with"
            subtitle="No exotic dependencies. Everything below is mainstream, well-supported, and easy to operate."
          />
          <dl className="mt-10 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
            {STACK.map((s) => (
              <div key={s.name} className="border-l hairline pl-4">
                <dt className="font-mono text-sm text-fg">{s.name}</dt>
                <dd className="mt-0.5 text-xs text-fg-muted">{s.role}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section>
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-6 py-16 md:grid-cols-2 md:py-20">
          <div className="rounded-lg border hairline bg-bg-raised p-6">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" aria-hidden />
              <h3 className="font-display text-base">The spec-kit workflow</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Each feature starts as a markdown spec that answers: goal, scope, server design, API surface, UX,
              security, what&apos;s out of scope. Implementation follows. The commit message references the spec.
              Thirty features have shipped this way.
            </p>
            <Link
              href="/changelog"
              className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              See the changelog <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          <div className="rounded-lg border hairline bg-bg-raised p-6">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-accent" aria-hidden />
              <h3 className="font-display text-base">Free tier, forever</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              One Supabase connection, the full admin surface, no credit card. Paid plans cover teams and unlimited
              projects. Feedback always welcome.
            </p>
            <a
              href="mailto:hello@suparbase.com"
              className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              hello@suparbase.com <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      <CTABand
        title="Curious enough to try?"
        body="Five minutes to your first connection. No credit card."
        primary={{ href: "/signup", label: "Get started" }}
        secondary={{ href: "/features", label: "See features" }}
      />
    </PublicLayout>
  );
}
