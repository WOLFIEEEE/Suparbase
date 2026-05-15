import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Code2,
  Lock,
  ShieldAlert,
  Sparkles,
  Undo2,
} from "lucide-react";
import { CTABand, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";

export const meta = {
  slug: "vibe-coders",
  title: "Suparbase for Vibe Coders",
  description:
    "If you're shipping with Cursor, Claude Code, Lovable, v0, or Replit Agent, Suparbase is the safety net your AI agent doesn't have. Encrypted credentials, RLS drift detection, per-agent session attribution, one-click undo.",
  audience: "Solo developers + small teams shipping with AI coding agents",
  bullets: [
    "Catches the Moltbook / Lovable-class RLS leak before the headline",
    "Per-AI-agent session attribution: Cursor, Claude Code, Replit Agent, Lovable, v0",
    "One-click undo for an agent session that did something stupid",
    "Encrypted credential vault, the AI never sees your service_role key",
  ],
} as const;

export function Page() {
  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-2">
              <Bot className="h-3 w-3 text-accent" aria-hidden />
              For Cursor / Claude Code / Lovable / v0 / Replit Agent
            </span>
          }
          title={
            <>
              The seat-belt for
              <br className="hidden sm:inline" /> vibe-coded apps.
            </>
          }
          subtitle="2026's pattern is clear: an AI agent eventually does something to your Supabase project you didn't intend. Suparbase is the layer that catches the RLS drift in 30 seconds and lets you undo the bad session with one button."
          actions={
            <>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Start free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/agent-sentry"
                className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                See Agent Sentry
              </Link>
            </>
          }
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="The 2026 pattern"
            title="Three real incidents. Same shape."
            subtitle="Every other week a vibe-coded Supabase project gets destroyed in public. The cause is almost always one of two things: RLS was wrong, or an AI agent ran one too many commands."
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Incident
              when="Jan 2026"
              who="Moltbook"
              what="1.5M API keys leaked, three days post-launch. AI built tables without RLS; the anon key was a master key."
              link="https://blog.ogwilliam.com/post/moltbook-hack-supabase-vibe-coding"
              linkLabel="Post-mortem"
            />
            <Incident
              when="Feb 2026"
              who="Lovable (CVE)"
              what="170 of 1,764 scanned apps had inverted RLS: 'if you're logged in, you can read every row'. 80% of vibe-coded apps share that mistake."
              link="https://dev.to/stefan_lederer_8b1bbcef01/we-scanned-1764-vibe-coded-apps-453-had-critical-vulnerabilities-heres-what-we-found-beyond-464e"
              linkLabel="Scan write-up"
            />
            <Incident
              when="Apr 2026"
              who="PocketOS"
              what="Cursor's Claude Opus agent deleted the production database AND every backup in 9 seconds. No way to undo."
              link="https://www.tomshardware.com/tech-industry/artificial-intelligence/claude-powered-ai-coding-agent-deletes-entire-company-database-in-9-seconds-backups-zapped-after-cursor-tool-powered-by-anthropics-claude-goes-rogue"
              linkLabel="Tom's Hardware"
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="What you get"
            title="The four things missing from every vibe-coding toolkit."
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Need
              icon={ShieldAlert}
              title="Continuous RLS drift detection"
              body="Sentry probes every public table with the actual anon key every time you scan. If RLS gets disabled or a permissive policy slips through, you know in 30 seconds, not next Tuesday in a Supabase email."
            />
            <Need
              icon={Lock}
              title="One-click quarantine"
              body="When a critical finding lands, apply a temporary deny-all RLS policy with one button. The bleeding stops. The Lift button drops the policy when you've fixed the root cause."
            />
            <Need
              icon={Bot}
              title="Per-AI-agent session attribution"
              body="Every write that goes through Suparbase's proxy is fingerprinted by User-Agent: Cursor, Claude Code, Replit Agent, Lovable, v0, the Vercel AI SDK, your own MCP server. Sessions group writes from the same agent within a 5-minute window."
            />
            <Need
              icon={Undo2}
              title="One-click session undo"
              body="When an agent does the unthinkable, click Undo. Every INSERT, UPDATE, and DELETE in the session is reversed in a single Postgres transaction. PocketOS would have had a button. You do."
            />
          </ul>
        </div>
      </section>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="The everyday stack"
            title="Plus everything an admin tool should do, AI-aware."
            subtitle="Suparbase started as the workspace you actually want next to your AI editor. The Sentry layer sits on top."
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Need
              icon={Sparkles}
              title="AI chat that reads your schema"
              body="Persistent conversations per project. The agent lists tables, inspects columns, runs filtered reads, drafts writes you confirm in a diff card. Tools include aggregate, list_indexes, audit_summary."
              compact
            />
            <Need
              icon={Code2}
              title="SQL playground"
              body="Read-only by default. Statement timeout. EXPLAIN. Recent dropdown. The agent's writes appear here as proposals before they apply."
              compact
            />
            <Need
              icon={AlertTriangle}
              title="RLS simulator"
              body="Paste a JWT claim set, pick a verb, run the query. Allow / deny per policy, all inside a transaction that rolls back. Find the bug before production does."
              compact
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <div className="surface rounded-lg p-6 md:p-10">
            <div className="text-[10px] uppercase tracking-[0.22em] text-fg-faint">
              How to wire it
            </div>
            <h2 className="mt-2 font-display text-2xl leading-tight md:text-3xl">
              Five minutes from incident to safety net.
            </h2>
            <ol className="mt-6 space-y-4">
              <Step
                n="1"
                title="Add your Supabase project"
                body={
                  <>
                    Paste the project URL + an anon key on the new-connection
                    page. Optionally add the Direct Postgres URL on the same
                    screen, this unlocks Sentry&apos;s pg_policies inspection
                    and one-click session undo.
                  </>
                }
              />
              <Step
                n="2"
                title="Open /c/<id>/sentry and run a scan"
                body={
                  <>
                    Baseline your exposure today. Sentry will list any
                    anon-readable tables, missing-or-permissive RLS policies,
                    and any PII-shaped columns currently exposed.
                  </>
                }
              />
              <Step
                n="3"
                title="Let the AI agents code"
                body={
                  <>
                    Cursor, Claude Code, Replit Agent, Lovable, v0, Vercel AI
                    SDK: pick your tool. Suparbase identifies each one from
                    the User-Agent on every authenticated write and groups
                    their mutations into sessions.
                  </>
                }
              />
              <Step
                n="4"
                title="If something goes wrong, click Undo session"
                body={
                  <>
                    Suparbase walks the audit log for that session in reverse
                    and reverts every INSERT / UPDATE / DELETE in a single
                    transaction. Either it all reverses or nothing changes.
                  </>
                }
              />
            </ol>
          </div>
        </div>
      </section>

      <CTABand
        title="Catch the next one before the headline."
        body="Free to self-host under MIT. Five minutes to set up. The seat-belt your AI agent doesn't have."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/agent-sentry", label: "How Sentry works" }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Incident({
  when,
  who,
  what,
  link,
  linkLabel,
}: {
  when: string;
  who: string;
  what: string;
  link: string;
  linkLabel: string;
}) {
  return (
    <article className="surface relative overflow-hidden rounded-lg border-danger/40 p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-danger/15 to-transparent"
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-hidden />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-faint">
            {when}
          </span>
        </div>
        <h3 className="mt-2 font-display text-lg leading-tight">{who}</h3>
        <p className="mt-2 text-sm text-fg-muted">{what}</p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          {linkLabel}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </article>
  );
}

function Need({
  icon: Icon,
  title,
  body,
  compact,
}: {
  icon: typeof ShieldAlert;
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <article className="surface rounded-lg p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border hairline bg-bg-raised">
          <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-sm leading-tight">{title}</h3>
          <p className={compact ? "text-[12px] leading-relaxed text-fg-muted" : "text-sm leading-relaxed text-fg-muted"}>
            {body}
          </p>
        </div>
      </div>
    </article>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-4">
      <span
        aria-hidden
        className="select-none font-mono text-[11px] uppercase tracking-wider text-accent"
      >
        {n}
      </span>
      <div className="border-l hairline pl-5">
        <h3 className="font-display text-base leading-tight">{title}</h3>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">{body}</p>
      </div>
    </li>
  );
}
