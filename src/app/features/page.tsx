import type { Metadata } from "next";
import {
  Activity,
  Database,
  FileText,
  FolderOpen,
  History,
  KeyRound,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  SquareCode,
  Table2,
  UserCog,
  Users,
} from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import {
  CTABand,
  FeatureCard,
  PageHeader,
  PageShell,
  SectionHeading,
} from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Features · Suparbase",
  description:
    "An authenticated admin workspace for any Supabase project: encrypted credentials, AI-assisted writes, row history, RLS debugger, SQL playground, and more.",
};

const PRIMARY_FEATURES = [
  {
    icon: Sparkles,
    title: "AI chat with tool-use",
    body:
      "A data-aware assistant that lists your tables, inspects schemas, runs filtered queries, and drafts writes you confirm in a diff card. Streams progress live.",
  },
  {
    icon: SquareCode,
    title: "SQL playground",
    body:
      "Run raw SQL against your project. Read-only by default (Postgres SET TRANSACTION READ ONLY plus a rollback). Statement timeout, EXPLAIN, recent history.",
  },
  {
    icon: ShieldCheck,
    title: "RLS policy debugger",
    body:
      "Browse pg_policies on every table and simulate SELECT/INSERT/UPDATE/DELETE as anon / authenticated / service_role with custom JWT claims, all rolled back.",
  },
  {
    icon: Pencil,
    title: "Inline cell editing",
    body:
      "Click any editable value on a row detail page to edit it in place. Enter to commit, Escape to cancel, optimistic UI with toast feedback.",
  },
  {
    icon: History,
    title: "Per-row history with diffs",
    body:
      "Every write captures a before/after snapshot. Each detail page shows a chronological timeline with column-level from→to diffs.",
  },
  {
    icon: Search,
    title: "Global Cmd-K row search",
    body:
      "Type an email, UUID, or order number and the palette scans every public-schema table in parallel, returning hits that jump straight to the row.",
  },
] as const;

const SECONDARY_FEATURES = [
  {
    icon: Table2,
    title: "Seven archetype admins",
    body:
      "Users, Content, Logs, Commerce, Tasks, Messages, plus a Generic fallback. Each ships purpose-built list + detail views matched automatically from AI analysis.",
  },
  {
    icon: FolderOpen,
    title: "Storage browser",
    body:
      "Bucket list, prefix navigation, drag-drop upload, multi-select delete, 1-hour signed URLs, public URL copy. Same encrypted key as PostgREST.",
  },
  {
    icon: UserCog,
    title: "Auth users admin",
    body:
      "Wraps /auth/v1/admin/*. Invite, generate recovery links, ban/unban, delete. Gracefully degrades when the connection's stored key isn't service_role.",
  },
  {
    icon: Users,
    title: "Bulk ops + CSV in/out",
    body:
      "Bulk delete, bulk update, CSV/JSON export with filter awareness, chunked CSV/JSON import with abort-or-skip on row errors.",
  },
  {
    icon: KeyRound,
    title: "Encrypted credentials",
    body:
      "AES-256-GCM at rest. The plaintext API key never persists to disk, and never touches a browser. Same vault holds the optional direct-Postgres URL.",
  },
  {
    icon: Database,
    title: "Server-side PostgREST proxy",
    body:
      "Every read and write routes through an authenticated Next.js route handler. The browser holds only a session cookie. Rate-limit buckets per verb class.",
  },
  {
    icon: Activity,
    title: "Audit log + recent activity",
    body:
      "Every write hits an audit table keyed to user, connection, table, primary key, and verb. The dashboard surfaces the last 10 entries with click-to-row.",
  },
  {
    icon: FileText,
    title: "Saved views + filter chips",
    body:
      "Pin search + filter combinations to any table. Filter by column with operators (eq, neq, lt, gt, ilike, in, is null). Sharable URL state.",
  },
] as const;

const FLOWS = [
  {
    title: "AI write flow",
    body:
      "You: \"set status to cancelled on all orders older than 30 days\". The agent calls get_table_schema, then count_rows, then propose_update with a preview of 5 affected rows. A yellow diff card appears. You hit Apply. The server re-validates and runs the PATCH; a row appears in the recent-activity feed.",
  },
  {
    title: "Connection setup flow",
    body:
      "Sign up, paste your project URL + API key. The key is AES-256-GCM encrypted before the row commits. The first dashboard load runs an AI schema analysis (optional, falls back to heuristics) so tables get the right archetype + display name automatically.",
  },
  {
    title: "Debug an RLS policy",
    body:
      "Open the RLS page, paste your direct Postgres URL once (encrypted in the same vault). Browse policies grouped by table, then simulate a request: pick a role, paste request.jwt.claims, click Run. SELECT/INSERT/UPDATE/DELETE allow-or-deny shows for each verb, all inside a transaction that always rolls back.",
  },
] as const;

export default async function FeaturesPage() {
  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Features"
          title={
            <>
              An admin tool built like an
              <br className="hidden sm:inline" /> actual product.
            </>
          }
          subtitle="Suparbase started as a wrapper around PostgREST and grew into a complete Supabase workspace: row editing, RLS debugging, storage, auth users, AI, raw SQL, audit history. Everything below ships today."
          actions={
            <>
              <a
                href="/signup"
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Start free
              </a>
              <a
                href="/docs"
                className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                Read the docs
              </a>
            </>
          }
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Headline features"
            title="The six you'll use every day"
            subtitle="These are the day-one wins. They take five minutes to learn and the rest of the product builds on them."
          />
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRIMARY_FEATURES.map((f) => (
              <li key={f.title}>
                <FeatureCard tone="accent" {...f} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Everything else"
            title="Day-two features"
            subtitle="The bits you reach for when something specific happens: a CSV import, a deleted user, a debugging session. They're all there."
          />
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SECONDARY_FEATURES.map((f) => (
              <li key={f.title}>
                <FeatureCard {...f} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="In practice"
            title="Three flows you'll recognise"
            subtitle="These are the moments where Suparbase replaces five other tools."
          />
          <ol className="mt-10 space-y-6">
            {FLOWS.map((f, i) => (
              <li key={f.title} className="grid grid-cols-[auto_1fr] gap-4 md:gap-6">
                <span
                  aria-hidden
                  className="select-none font-mono text-[11px] uppercase tracking-wider text-accent"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="border-l hairline pl-5 md:pl-6">
                  <h3 className="font-display text-lg leading-tight md:text-xl">{f.title}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted md:text-base">
                    {f.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CTABand
        title="Drop in your Supabase key and ship."
        body="Five minutes to set up. Free to self-host. No credit card on the hosted plan."
        primary={{ href: "/signup", label: "Get started" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </PublicLayout>
  );
}
