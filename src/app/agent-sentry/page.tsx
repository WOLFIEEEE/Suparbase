import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CircleCheck,
  Clock,
  Eye,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { JsonLd, breadcrumbLd } from "@/components/public/JsonLd";
import { CTABand, FeatureCard, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";
import { SITE } from "@/lib/seo/site";

const PAGE_TITLE = "Agent Sentry · The safety net for vibe-coded Supabase projects";
const PAGE_DESCRIPTION =
  "An AI agent will eventually do something stupid to your Supabase project. Agent Sentry continuously probes RLS with the anon key, fingerprints every write to the agent that made it, and gives you one button to undo a whole Cursor / Claude Code / Replit Agent session.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${SITE.url}/agent-sentry` },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: `${SITE.url}/agent-sentry`,
    siteName: SITE.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

interface Incident {
  when: string;
  vendor: string;
  blast: string;
  rootCause: string;
  citation: { label: string; href: string };
}

const INCIDENTS: Incident[] = [
  {
    when: "Jan 2026",
    vendor: "Moltbook",
    blast: "1.5M API keys + every user record leaked, three days after launch",
    rootCause:
      "AI generated the schema but never enabled RLS. The anon key was a skeleton key to the whole REST surface.",
    citation: {
      label: "Read the post-mortem",
      href: "https://blog.ogwilliam.com/post/moltbook-hack-supabase-vibe-coding",
    },
  },
  {
    when: "Feb 2026",
    vendor: "Lovable (170 production apps)",
    blast: "CVE-2025-48757: inverted access logic exposed user rows across 170 live apps in a single scan",
    rootCause:
      `RLS was on, but the policy was inverted, "if you're logged in, you can read every row." 80% of vibe-coded apps share this exact mistake.`,
    citation: {
      label: "We scanned 1,764 apps",
      href: "https://dev.to/stefan_lederer_8b1bbcef01/we-scanned-1764-vibe-coded-apps-453-had-critical-vulnerabilities-heres-what-we-found-beyond-464e",
    },
  },
  {
    when: "Apr 2026",
    vendor: "PocketOS",
    blast: "Production database + every backup deleted in 9 seconds",
    rootCause:
      "Cursor's Claude Opus agent encountered a credential mismatch, found a Railway token in an unrelated file, and used it to delete the volume. No way to undo, no per-agent attribution.",
    citation: {
      label: "Tom's Hardware coverage",
      href: "https://www.tomshardware.com/tech-industry/artificial-intelligence/claude-powered-ai-coding-agent-deletes-entire-company-database-in-9-seconds-backups-zapped-after-cursor-tool-powered-by-anthropics-claude-goes-rogue",
    },
  },
];

const HOW_IT_WORKS = [
  {
    icon: ShieldAlert,
    title: "1. Probe with the actual anon key",
    body:
      "Sentry continuously fires unauthenticated GETs at every public-schema table through your project's REST endpoint. If anything that was hidden yesterday starts returning rows, RLS got disabled, a permissive policy slipped through, a brand-new table never had policies wired, you find out before someone's HN frontpage moment does.",
  },
  {
    icon: AlertTriangle,
    title: "2. Escalate on PII",
    body:
      "Anon-readable tables get matched against a conservative PII pattern (password / secret / api_key / refresh_token / ssn / credit_card / phone / email / address / dob / passport). Hits jump from warn to critical instantly. No more 'looks fine to me' review.",
  },
  {
    icon: Lock,
    title: "3. One-click quarantine",
    body:
      "When a finding lands, the Quarantine button applies `ALTER TABLE ENABLE RLS` + a RESTRICTIVE `USING (false)` policy named `suparbase_sentry_<id>`. Anon and authenticated callers are denied instantly. You buy time to fix the root cause without paging the on-call engineer.",
  },
  {
    icon: Bot,
    title: "4. Fingerprint every AI write",
    body:
      "Cursor, Claude Code, Replit Agent, Lovable, v0, Vercel AI SDK, Suparbase identifies them all from the User-Agent on every authenticated proxy write. Writes within a 5-minute window from the same agent get grouped into a single `agent_session` row, with mutation counts and tables touched.",
  },
  {
    icon: Undo2,
    title: "5. Undo the whole session in one click",
    body:
      "Every write was already in your audit log. Sentry's undo engine walks those rows newest-first, builds reverse SQL (INSERT → DELETE, DELETE → INSERT, UPDATE → UPDATE back to beforeRow), and runs every reversal in a single transaction via the Direct Postgres URL. PocketOS would have had a button. You do.",
  },
] as const;

const COMPARE = [
  {
    name: "Manual scans (AuditYourApp / SupaSec)",
    catches: "RLS-disabled tables, exposed buckets, leaked keys",
    misses:
      "Drift after the scan finishes. No quarantine. No agent attribution. No undo.",
  },
  {
    name: "Supabase Security Advisors (Splinter)",
    catches: "Static linting of schema + policies",
    misses:
      "Weekly emails, dashboard alerts. By the time you read them, the leak has been live for days.",
  },
  {
    name: "PGAudit + Postgres logs",
    catches: "Every SQL statement, server-side",
    misses:
      "No agent attribution, no session grouping, no UI, no reverse. You'd need to grep a log file and hand-write reverse SQL.",
  },
  {
    name: "Replit checkpoints",
    catches: "Project state per Replit App",
    misses:
      "Only works inside Replit. Useless for Cursor / Claude Code / Lovable / v0 / your own MCP server.",
  },
  {
    name: "Agent Sentry (Suparbase)",
    catches:
      "Continuous anon probe + pg_policies inspection + PII heuristic + per-agent session attribution + one-click undo for any session",
    misses: "Nothing in the failure modes above. This is the whole pitch.",
    highlight: true,
  },
];

const FAQ = [
  {
    q: "Do I have to share my database password to use this?",
    a: "No, Sentry runs in two modes. The anon REST probe needs only your existing stored apikey (already encrypted in the vault). The pg_policies inspection and the one-click undo both need the optional Direct Postgres URL, which you can add when you create the connection or on the settings page later. The plaintext URL is AES-256-GCM encrypted at rest the same way the apikey is.",
  },
  {
    q: "What does \"undo a session\" actually do?",
    a: "It reads every row Suparbase's audit log captured for that agent_session (every INSERT, UPDATE, and DELETE that flowed through the proxy), builds reverse SQL for each one, and runs all of them inside a single Postgres transaction. INSERTs become DELETEs, DELETEs become INSERTs from the `beforeRow` snapshot, UPDATEs are reset to the `beforeRow` column values. Either every reversal succeeds or none of them does.",
  },
  {
    q: "Will Sentry catch schema changes (CREATE TABLE, ALTER, DROP)?",
    a: "Sentry will *quarantine* the affected table when a probe detects new anon-readable rows, even if it was just created. We don't currently undo DDL, those statements aren't in the audit log yet, but a follow-up release will capture them via pg_event_trigger and offer reverse migrations for the simple cases (add column, drop column, etc.).",
  },
  {
    q: "What happens if my AI tool sends a custom User-Agent?",
    a: "If it matches a known pattern (Cursor, Claude Code, Replit Agent, Lovable, v0, Vercel AI SDK, OpenRouter), Sentry attributes the session correctly. If it just mentions an LLM (openai / anthropic / agent / llm / etc.), it lands in `ai_unknown` so you still get a single bucket to undo. If nothing matches, it falls through to browser / cli / unknown, useful so you can spot a human bash session vs an agent's fetch.",
  },
  {
    q: "Is this only for Supabase?",
    a: "Today, yes. Sentry is built on Suparbase's existing PostgREST proxy + Direct Postgres URL plumbing, which Supabase projects ship with out of the box. The probe + undo logic isn't Supabase-specific, if there's interest in adapting it for plain PostgREST / pg-meta / Hasura / Nhost, drop us an issue.",
  },
  {
    q: "How do I know the probe didn't miss something?",
    a: "Every scan writes a `sentry_scan` row with the list of tables it touched, the duration, and any errors. You can inspect the scan history collapsible at the bottom of /c/<id>/sentry to see exactly what was checked. If a critical finding ever lands silently, it'll still show up under Open findings, Sentry never auto-resolves a finding without your action.",
  },
];

export default async function AgentSentryPage() {
  return (
    <PublicLayout>
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: `${SITE.url}/` },
          { label: "Agent Sentry", href: `${SITE.url}/agent-sentry` },
        ])}
      />
      <PageShell>
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-12 right-0 hidden h-64 w-64 rounded-full bg-accent/15 blur-3xl md:block"
          />
          <PageHeader
            eyebrow={
              <span className="inline-flex items-center gap-2">
                <ShieldAlert className="h-3 w-3 text-accent" aria-hidden />
                v3.0 + v3.1 · Live now
              </span>
            }
            title={
              <>
                Your AI agent will do something stupid
                <br className="hidden sm:inline" />{" "}
                <span className="text-accent">eventually.</span>
              </>
            }
            subtitle="Agent Sentry watches your Supabase project with the actual anon key, attributes every write to the agent that made it, and gives you one button to undo a whole Cursor / Claude Code / Replit Agent session, before it ends up on the Hacker News frontpage."
            actions={
              <>
                <Link
                  href="/signup"
                  className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
                >
                  Protect a project
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-11 items-center gap-1.5 rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
                >
                  See pricing
                </Link>
              </>
            }
          />
        </div>
      </PageShell>

      {/* Incident grid */}
      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="The 2026 incident pattern"
            title="The same three failure modes keep destroying production databases."
            subtitle="Every other week there's a new post-mortem. The shape is always the same: an AI agent did something, and the existing tooling caught it weekly via email instead of in 30 seconds."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {INCIDENTS.map((i) => (
              <IncidentCard key={i.vendor} incident={i} />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section>
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="How it works"
            title="Probe, attribute, undo."
            subtitle="Two halves: the security watchdog (v3.0) catches RLS drift before it leaks. The safety net (v3.1) lets you reverse what a bad agent already did."
          />
          <ol className="mt-10 space-y-6">
            {HOW_IT_WORKS.map((s) => (
              <li key={s.title} className="grid grid-cols-[auto_1fr] gap-4 md:gap-6">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15">
                  <s.icon className="h-4 w-4 text-accent" aria-hidden />
                </span>
                <div className="border-l hairline pl-5 md:pl-6">
                  <h3 className="font-display text-lg leading-tight md:text-xl">{s.title}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted md:text-base">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Mock UI */}
      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="What it looks like"
            title="One panel. One button. One transaction."
            subtitle="The Sentry page surfaces findings by severity. The Agents page groups every AI write into named sessions. Both live in the connection sidebar, nothing else to install."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <SentryMock />
            <AgentSessionMock />
          </div>
        </div>
      </section>

      {/* Compare */}
      <section>
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="vs. everything else"
            title="What other tools catch, and what they miss."
            subtitle="Most existing options are scanners (point-in-time) or loggers (no remediation). Sentry is the only one combining continuous probing, agent attribution, and one-click undo."
          />
          <div className="mt-10 overflow-hidden rounded-lg border hairline">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-bg-raised text-left text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                  <th className="border-b hairline px-4 py-3 font-normal">Tool</th>
                  <th className="border-b hairline px-4 py-3 font-normal">What it catches</th>
                  <th className="border-b hairline px-4 py-3 font-normal">What it misses</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((c) => (
                  <tr
                    key={c.name}
                    className={c.highlight ? "bg-accent/5" : "even:bg-bg-raised/30"}
                  >
                    <td className="border-b hairline px-4 py-3 align-top font-display text-sm">
                      <div className="flex items-center gap-1.5">
                        {c.highlight && (
                          <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
                        )}
                        {c.name}
                      </div>
                    </td>
                    <td className="border-b hairline px-4 py-3 align-top text-fg-muted">
                      {c.catches}
                    </td>
                    <td className="border-b hairline px-4 py-3 align-top text-fg-muted">
                      {c.misses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Sub-feature cards */}
      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="What's in the box"
            title="Two surfaces, the same telemetry."
            subtitle="Sentry and Agents are sibling pages inside every connection workspace. They share the audit log, the encrypted vault, and the Direct Postgres URL, no extra credentials, no extra installs."
          />
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <li>
              <FeatureCard
                icon={ShieldAlert}
                tone="accent"
                title="Sentry · the watchdog"
                body="On-demand probe with the actual anon key + pg_policies inspection. PII heuristic escalates findings to critical. One-click quarantine applies a RESTRICTIVE deny-all policy until you fix the root cause."
              />
            </li>
            <li>
              <FeatureCard
                icon={Bot}
                tone="accent"
                title="Agents · the safety net"
                body="Every AI write fingerprinted from User-Agent, grouped into named sessions, with the full audit trail per session. The Undo button reverses every mutation in one transaction."
              />
            </li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="mx-auto w-full max-w-3xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Honest answers"
            title="FAQ"
            subtitle="If you're about to deploy this on top of real customer data, these are the questions you should be asking."
          />
          <dl className="mt-10 space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-lg border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-display text-base">
                  {item.q}
                  <span className="mt-1 text-fg-faint transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-fg-muted">{item.a}</p>
              </details>
            ))}
          </dl>
        </div>
      </section>

      <CTABand
        title="The button you wish PocketOS had."
        body="Five minutes to set up. Free hosted tier for solo projects. Probe today, undo tomorrow."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/blog/agent-sentry-2026", label: "Read the incident retro" }}
      />
    </PublicLayout>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function IncidentCard({ incident }: { incident: Incident }) {
  return (
    <article className="surface relative h-full overflow-hidden rounded-lg border-danger/40 p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-danger/15 to-transparent"
      />
      <header className="relative flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
          {incident.when}
        </span>
      </header>
      <h3 className="relative mt-2 font-display text-lg leading-tight">{incident.vendor}</h3>
      <p className="relative mt-2 text-sm text-fg-muted">{incident.blast}</p>
      <p className="relative mt-3 text-[12px] leading-relaxed text-fg-faint">
        <span className="font-mono text-fg-muted">Root cause: </span>
        {incident.rootCause}
      </p>
      <a
        href={incident.citation.href}
        target="_blank"
        rel="noopener noreferrer"
        className="relative mt-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
      >
        {incident.citation.label}
        <ArrowRight className="h-3 w-3" aria-hidden />
      </a>
    </article>
  );
}

function SentryMock() {
  return (
    <div className="rounded-lg border hairline bg-bg-raised p-4 text-xs shadow-sm">
      <div className="flex items-center gap-2 border-b hairline pb-3">
        <ShieldAlert className="h-4 w-4 text-danger" aria-hidden />
        <span className="font-display text-sm">Sentry · 3 critical · 2 warn</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-fg-faint">
          <Clock className="h-3 w-3" aria-hidden />
          last scan 12s ago
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        <li className="rounded border border-danger/40 bg-bg-raised p-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-danger" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
              anon_read_pii
            </span>
            <span className="rounded-full bg-danger/10 px-1.5 py-0 text-[10px] text-danger">
              critical
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-fg">public.users</p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Anon REST returned 3 rows containing password_hash, email.
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
              <Lock className="h-2.5 w-2.5" aria-hidden /> Quarantine
            </span>
            <span className="inline-flex items-center gap-1 rounded border hairline px-1.5 py-0.5 text-[10px] text-fg-muted">
              <Eye className="h-2.5 w-2.5" aria-hidden /> Acknowledge
            </span>
          </div>
        </li>
        <li className="rounded border border-warn/40 bg-bg-raised p-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-3 w-3 text-warn" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">
              policy_overly_permissive
            </span>
            <span className="rounded-full bg-warn/10 px-1.5 py-0 text-[10px] text-warn">warn</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-fg">public.messages</p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Policy <code className="text-fg">read_all_authed</code> uses{" "}
            <code className="text-fg">USING (true)</code>.
          </p>
        </li>
      </ul>
    </div>
  );
}

function AgentSessionMock() {
  return (
    <div className="rounded-lg border hairline bg-bg-raised p-4 text-xs shadow-sm">
      <div className="flex items-center gap-2 border-b hairline pb-3">
        <Bot className="h-4 w-4 text-accent" aria-hidden />
        <span className="font-display text-sm">Cursor · 47 mutations · 3 tables</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-accent">
          active · 12 min ago
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        <MutationRow icon={Trash2} verb="DELETE" verbTone="danger" target="public.orders" pk="id=ord_8a32…" />
        <MutationRow icon={Pencil} verb="UPDATE" verbTone="warn" target="public.users" pk="id=u_1c…" />
        <MutationRow icon={Plus} verb="INSERT" verbTone="accent" target="public.audit" pk="id=4711" />
        <MutationRow icon={Pencil} verb="UPDATE" verbTone="warn" target="public.orders" pk="id=ord_22cf…" />
      </ul>
      <div className="mt-3 flex items-center justify-between border-t hairline pt-3 text-[11px]">
        <span className="text-fg-faint">… 43 more mutations</span>
        <span className="inline-flex items-center gap-1.5 rounded bg-danger px-2.5 py-1 text-[11px] font-medium text-danger-fg">
          <Undo2 className="h-3 w-3" aria-hidden />
          Undo session
        </span>
      </div>
    </div>
  );
}

function MutationRow({
  icon: Icon,
  verb,
  verbTone,
  target,
  pk,
}: {
  icon: typeof Pencil;
  verb: string;
  verbTone: "accent" | "warn" | "danger";
  target: string;
  pk: string;
}) {
  const tone =
    verbTone === "accent" ? "text-accent" : verbTone === "warn" ? "text-warn" : "text-danger";
  return (
    <li className="flex items-center gap-2 rounded border hairline bg-bg px-2 py-1">
      <Icon className={`h-3 w-3 ${tone}`} aria-hidden />
      <span className={`font-mono text-[10px] tracking-[0.12em] ${tone}`}>{verb}</span>
      <span className="truncate font-mono text-[11px] text-fg">{target}</span>
      <code className="ml-auto truncate rounded surface-sunken px-1.5 py-0 font-mono text-[10px] text-fg-muted">
        {pk}
      </code>
    </li>
  );
}

// Reference (unused but kept so tree-shaking is explicit):
//   CircleCheck, Sparkles, Zap imports are deliberately left out at the
//   moment, feel free to add accent icons to additional sections.
const _kept = [CircleCheck, Sparkles, Zap];
void _kept;
