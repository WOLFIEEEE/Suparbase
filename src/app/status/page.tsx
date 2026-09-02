import type { Metadata } from "next";
import { Activity, CircleCheck, CircleX, MinusCircle } from "lucide-react";
import { sql as drizzleSql } from "drizzle-orm";
import { db } from "@/server/db";
import { isEmailConfigured } from "@/server/email/resend";
import { isBillingConfigured } from "@/server/billing/dodo";
import { hasErrorReporter } from "@/server/observability/report";
import { isAdminPanelEnabled } from "@/server/admin/guard";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Status · Suparbase",
  description: "Real-time status of every Suparbase subsystem on this deployment.",
  alternates: { canonical: "/status" },
};

export const dynamic = "force-dynamic";

interface CheckResult {
  name: string;
  description: string;
  status: "ok" | "warn" | "down" | "off";
  hint?: string;
}

/**
 * Real-time public status page. Hits the same checks as
 * /api/health but renders them as a human-readable summary
 * useful for an at-a-glance "is the deploy live + everything
 * wired" view that customers can refresh themselves.
 *
 * Each check returns one of: ok / warn / down / off.
 *   - ok    : working as expected
 *   - warn  : optional integration missing (not all customers need it)
 *   - down  : core dependency unreachable
 *   - off   : intentionally not configured on this deployment
 */
async function runChecks(): Promise<CheckResult[]> {
  let dbOk = false;
  try {
    await db.execute(drizzleSql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return [
    {
      name: "Database",
      description: "Application Postgres, where sessions, connections, and audit live.",
      status: dbOk ? "ok" : "down",
      hint: dbOk ? "Round-trip in <100ms" : "Cannot reach the database. The app is degraded.",
    },
    {
      name: "Encrypted proxy",
      description: "AES-256-GCM credential vault + server-side PostgREST proxy.",
      status: dbOk ? "ok" : "down",
      hint: dbOk
        ? "Always-on; failures show up in /api/health."
        : "Depends on the database being reachable.",
    },
    {
      name: "Transactional email (Resend)",
      description: "Team invitations + password-reset links.",
      status: isEmailConfigured() ? "ok" : "off",
      hint: isEmailConfigured()
        ? "Configured. Invitations and resets deliver via Resend."
        : "Not configured on this deployment. Invitations fall back to copy-link mode; password-reset email is unavailable.",
    },
    {
      name: "Billing (Dodo Payments)",
      description: "Subscription checkout, webhooks, and invoice history.",
      status: isBillingConfigured() ? "ok" : "off",
      hint: isBillingConfigured()
        ? "Configured. The Free tier is fully available regardless."
        : "Not configured on this deployment. The Free tier still works.",
    },
    {
      name: "Error reporting",
      description: "Captures unhandled exceptions for the operator.",
      status: hasErrorReporter() ? "ok" : "warn",
      hint: hasErrorReporter()
        ? "SENTRY_DSN is set. Errors are captured + logged."
        : "Optional. When unset, errors only land in stdout logs.",
    },
    {
      name: "Admin panel",
      description: "Operator surface at /admin (audit search, users, billing events).",
      status: isAdminPanelEnabled() ? "ok" : "off",
      hint: isAdminPanelEnabled()
        ? "Configured via SUPARBASE_ADMIN_EMAILS."
        : "Not configured on this deployment.",
    },
  ];
}

export default async function StatusPage() {
  const checks = await runChecks();
  const overall = checks.some((c) => c.status === "down")
    ? "down"
    : checks.some((c) => c.status === "warn")
    ? "warn"
    : "ok";

  const overallCopy =
    overall === "ok"
      ? "All systems operational."
      : overall === "warn"
      ? "Operating with optional integrations off."
      : "Core dependency down.";

  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Status"
          title={overallCopy}
          subtitle={`Live snapshot of this deployment's subsystems. Refreshes on every page load. Subscribe to incident updates by emailing contact@suparbase.com.`}
          actions={<StatusBadge status={overall} />}
        />
        <ul className="mt-12 grid grid-cols-1 gap-3">
          {checks.map((c) => (
            <li key={c.name}>
              <article className="flex flex-wrap items-start gap-4 rounded-lg border hairline bg-bg-raised p-4">
                <StatusIcon status={c.status} />
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="font-display text-base">{c.name}</h2>
                  <p className="text-xs leading-relaxed text-fg-muted">{c.description}</p>
                  {c.hint && <p className="text-[11px] text-fg-faint">{c.hint}</p>}
                </div>
                <StatusBadge status={c.status} />
              </article>
            </li>
          ))}
        </ul>

        <section className="mt-10 rounded-md border hairline bg-bg-raised/40 p-4 text-xs text-fg-muted">
          <p className="flex items-start gap-2">
            <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            <span>
              This page renders the same data the operator gets from{" "}
              <code className="font-mono">GET /api/health</code>. For
              programmatic monitoring (UptimeRobot, Pingdom, etc.), hit that
              endpoint directly - it returns a stable JSON shape with{" "}
              <code className="font-mono">db</code>, <code className="font-mono">email</code>,{" "}
              <code className="font-mono">billing</code>, <code className="font-mono">observability</code>,
              and <code className="font-mono">version</code>.
            </span>
          </p>
        </section>
      </PageShell>
    </PublicLayout>
  );
}

function StatusIcon({ status }: { status: CheckResult["status"] }) {
  if (status === "ok") {
    return <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />;
  }
  if (status === "warn") {
    return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />;
  }
  if (status === "down") {
    return <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />;
  }
  return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" aria-hidden />;
}

function StatusBadge({ status }: { status: CheckResult["status"] }) {
  const tone =
    status === "ok"
      ? "bg-accent/15 text-accent"
      : status === "warn"
      ? "bg-amber-500/15 text-amber-400"
      : status === "down"
      ? "bg-danger/15 text-danger"
      : "bg-bg/60 text-fg-faint";
  const label =
    status === "ok"
      ? "Operational"
      : status === "warn"
      ? "Degraded"
      : status === "down"
      ? "Down"
      : "Not configured";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${tone}`}
    >
      {label}
    </span>
  );
}
