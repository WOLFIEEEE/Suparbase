import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CircleCheck, CircleDashed, Clock } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Roadmap · Suparbase",
  description: "What we just shipped, what we're working on, and what's queued.",
  alternates: { canonical: "/roadmap" },
};

type Status = "shipped" | "in_progress" | "next";

interface Item {
  status: Status;
  title: string;
  body: string;
  /** Optional anchor into /changelog or another reference. */
  ref?: { href: string; label: string };
}

const ITEMS: Item[] = [
  // Shipped
  {
    status: "shipped",
    title: "Two-factor authentication (TOTP + recovery codes)",
    body: "Optional 2FA via any standards-compliant authenticator (Authy, 1Password, Bitwarden). 10 single-use recovery codes generated at enable time. Required for admin-panel access in deployments that have admins configured.",
    ref: { href: "/changelog", label: "v3.8.0" },
  },
  {
    status: "shipped",
    title: "Forgot-password flow",
    body: "Self-service password reset via email link. SHA-256-hashed tokens, 1-hour expiry, enumeration-resistant, single-use.",
    ref: { href: "/changelog", label: "v3.6.0" },
  },
  {
    status: "shipped",
    title: "Account deletion (GDPR Art. 17)",
    body: "Self-service delete from /settings/account with typed confirmation. Cascades through every linked row.",
    ref: { href: "/changelog", label: "v3.6.0" },
  },
  {
    status: "shipped",
    title: "Invoice history",
    body: "Dodo-hosted PDF invoices accessible from /settings/billing - no more digging through receipt emails.",
    ref: { href: "/changelog", label: "v3.7.0" },
  },
  {
    status: "shipped",
    title: "Admin: audit log search",
    body: "Forensic search at /admin/audit by user, connection, table, verb, and date range. Backed by the new compound index.",
    ref: { href: "/changelog", label: "v3.6.0" },
  },
  {
    status: "shipped",
    title: "Database optimisation pass",
    body: "Index rework, query refactors, partial indexes for unapplied webhook events, batched audit-log retention.",
    ref: { href: "/changelog", label: "v3.4.3" },
  },
  {
    status: "shipped",
    title: "Agent Sentry (one-click session undo)",
    body: "Every AI-agent write is fingerprinted and bucketed into a session. One-click undo replays the audit log in reverse inside a single transaction.",
    ref: { href: "/agent-sentry", label: "Feature page" },
  },
  {
    status: "shipped",
    title: "Public API + personal tokens",
    body: "Read-only tokens for /api/public/v1: list connections, pull the live schema or audit activity, read Sentry findings, run a SELECT. Revocable, expiring, rate-limited per token.",
    ref: { href: "/docs/api", label: "API reference" },
  },
  {
    status: "shipped",
    title: "Connection import / export",
    body: "Bulk-paste projects from JSON or CSV with a validated preview; export a secret-free manifest to move between accounts.",
    ref: { href: "/changelog", label: "v3.20.0" },
  },
  {
    status: "shipped",
    title: "Production guard + scheduled Sentry",
    body: "Label a connection production / staging / development. Production adds typed confirmations to destructive actions. Sentry can re-scan on a cadence and notify in-app.",
    ref: { href: "/changelog", label: "v3.20.0" },
  },
  {
    status: "shipped",
    title: "Schema snapshots, ERD, and types",
    body: "Automatic drift snapshots with a diff view, a live entity-relationship diagram, and TypeScript / Zod types generated from the real schema.",
    ref: { href: "/changelog", label: "v3.20.0" },
  },
  {
    status: "shipped",
    title: "Performance advisor",
    body: "pg_stat-backed page: table sizes, scan patterns, bloat, unused indexes, slowest statements, and conservative suggestions with copy-paste SQL.",
    ref: { href: "/changelog", label: "v3.20.0" },
  },

  // In progress
  {
    status: "in_progress",
    title: "Annual billing",
    body: "Discount for paying yearly. UI scaffolded; live once the Dodo product is published.",
  },
  {
    status: "in_progress",
    title: "End-to-end Playwright suite",
    body: "24 public and auth-adjacent browser checks now run in CI. Seeded signed-in dashboard workflows and sandbox payment flows are next.",
  },
  {
    status: "in_progress",
    title: "Real-time error reporting (Sentry)",
    body: "Code paths instrumented via the reportError() shim. Operator-side wiring (instrumentation.ts + DSN) is in deployment guides.",
  },

  // Next (Q3)
  {
    status: "next",
    title: "SSO via SAML / OIDC",
    body: "For Team-plan customers. Identity provider integration (Okta, Auth0, JumpCloud).",
  },
  {
    status: "next",
    title: "SOC 2 Type I",
    body: "Pursuing certification through Drata. Readiness assessment complete; remediation in progress.",
  },
  {
    status: "next",
    title: "Write scope for API tokens",
    body: "Opt-in write tokens (row upserts, snippet runs in write mode) with the same audit + agent-session attribution as the UI.",
  },
  {
    status: "next",
    title: "More AI-write archetypes",
    body: "Sentry now fingerprints 25 agent kinds, including Cursor, Claude Code, Codex, Copilot, Windsurf, Gemini CLI, Devin, Bolt, Zed, Amp, Kiro, OpenCode, Trae, and Junie. Keep expanding as new runtimes appear.",
  },
  {
    status: "next",
    title: "Column masking for viewers",
    body: "Per-column PII masks applied in the proxy for the viewer role, so support staff can browse without seeing raw emails or addresses.",
  },
];

const STATUS_ORDER: Record<Status, number> = {
  shipped: 0,
  in_progress: 1,
  next: 2,
};

export default async function RoadmapPage() {
  const grouped = (["shipped", "in_progress", "next"] as Status[]).map((s) => ({
    status: s,
    items: ITEMS.filter((i) => i.status === s).sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
    ),
  }));

  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Roadmap"
          title="What we shipped, what's next."
          subtitle="No promises on dates - but we ship in tagged releases and write each one up in the changelog. If you want to push something up the list, email contact@suparbase.com."
          actions={
            <Link
              href="/changelog"
              className="inline-flex h-9 items-center gap-1 rounded-md border hairline px-4 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
            >
              Full changelog <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        />

        <div className="mt-12 space-y-10">
          {grouped.map(({ status, items }) => (
            <section key={status} className="space-y-4">
              <div className="flex items-center gap-2">
                <StatusIcon status={status} />
                <h2 className="font-display text-xl">{labelFor(status)}</h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  {items.length} item{items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <li key={item.title}>
                    <article className="flex h-full flex-col gap-2 rounded-lg border hairline bg-bg-raised p-5">
                      <h3 className="font-display text-base">{item.title}</h3>
                      <p className="flex-1 text-xs leading-relaxed text-fg-muted">{item.body}</p>
                      {item.ref && (
                        <Link
                          href={item.ref.href}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                        >
                          {item.ref.label}
                          <ArrowUpRight className="h-3 w-3" aria-hidden />
                        </Link>
                      )}
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </PageShell>
    </PublicLayout>
  );
}

function labelFor(s: Status): string {
  if (s === "shipped") return "Recently shipped";
  if (s === "in_progress") return "In progress";
  return "Next";
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "shipped") {
    return <CircleCheck className="h-4 w-4 text-accent" aria-hidden />;
  }
  if (status === "in_progress") {
    return <Clock className="h-4 w-4 text-amber-400" aria-hidden />;
  }
  return <CircleDashed className="h-4 w-4 text-fg-faint" aria-hidden />;
}
