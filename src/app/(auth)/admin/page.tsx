import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CircleDollarSign,
  Database,
  FileClock,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { getBillingStats } from "@/server/billing/repo";
import {
  getAdminOperationsSnapshot,
  listAdminActions,
  listUsers,
} from "@/server/admin/repo";
import { AdminMetric, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import { relativeFromNow } from "@/lib/ui/time";

export const metadata: Metadata = { title: "Admin · Overview" };

export default async function AdminDashboardPage() {
  const [billing, snapshot, recentUsers, recentActions] = await Promise.all([
    getBillingStats(),
    getAdminOperationsSnapshot(),
    listUsers({ limit: 6 }),
    listAdminActions({ limit: 6 }),
  ]);
  const attention = [
    snapshot.workload.criticalFindings > 0 && {
      label: `${snapshot.workload.criticalFindings} open critical security finding${snapshot.workload.criticalFindings === 1 ? "" : "s"}`,
      href: "/admin/operations#security",
      tone: "danger" as const,
    },
    snapshot.billing.unappliedEvents > 0 && {
      label: `${snapshot.billing.unappliedEvents} billing event${snapshot.billing.unappliedEvents === 1 ? "" : "s"} awaiting apply`,
      href: "/admin/billing?applied=pending",
      tone: "danger" as const,
    },
    snapshot.workload.failedSyncRuns24h > 0 && {
      label: `${snapshot.workload.failedSyncRuns24h} sync failure${snapshot.workload.failedSyncRuns24h === 1 ? "" : "s"} in 24 hours`,
      href: "/admin/operations#automation",
      tone: "warn" as const,
    },
    snapshot.automation.watchErrors + snapshot.automation.reportErrors > 0 && {
      label: `${snapshot.automation.watchErrors + snapshot.automation.reportErrors} enabled automation${snapshot.automation.watchErrors + snapshot.automation.reportErrors === 1 ? "" : "s"} reporting errors`,
      href: "/admin/operations#automation",
      tone: "warn" as const,
    },
    snapshot.users.emailSuppressed > 0 && {
      label: `${snapshot.users.emailSuppressed} email-suppressed account${snapshot.users.emailSuppressed === 1 ? "" : "s"}`,
      href: "/admin/users?verification=suppressed",
      tone: "warn" as const,
    },
  ].filter(Boolean) as Array<{ label: string; href: string; tone: "danger" | "warn" }>;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Control plane"
        title="Operations overview"
        description="Live product, security and revenue signals for support and incident response."
        actions={
          <Link href="/admin/operations" className="inline-flex min-h-10 items-center rounded-md border hairline px-3 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg">
            View system health
          </Link>
        }
      />

      <section aria-label="Core metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <AdminMetric icon={Users} label="Total users" value={snapshot.users.total.toLocaleString()} detail={`${snapshot.users.new7d} joined in 7 days`} />
        <AdminMetric icon={CircleDollarSign} label="Estimated MRR" value={formatUsd(billing.estimatedMonthlyRevenueCents)} detail={`${billing.paidActive} active · ${billing.trialing} trialing`} tone="ok" />
        <AdminMetric icon={Database} label="Connections" value={snapshot.connections.total.toLocaleString()} detail={`${snapshot.connections.active7d} active in 7 days`} />
        <AdminMetric icon={Activity} label="Writes, 24 hours" value={snapshot.workload.auditWrites24h.toLocaleString()} detail={`${snapshot.workload.activeAgentSessions} live agent sessions`} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="rounded-lg border hairline bg-bg-raised">
          <div className="flex items-center justify-between gap-3 border-b hairline px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Needs attention</h2>
              <p className="mt-0.5 text-[11px] text-fg-faint">Signals requiring an operator decision.</p>
            </div>
            <AdminStatus tone={attention.length === 0 ? "ok" : "warn"}>
              {attention.length === 0 ? "Clear" : `${attention.length} open`}
            </AdminStatus>
          </div>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-8 text-sm text-fg-muted">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldAlert className="h-4 w-4" aria-hidden />
              </span>
              No critical security, billing, sync or automation issues are open.
            </div>
          ) : (
            <ul className="divide-y hairline">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-bg/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70">
                    <AlertTriangle className={item.tone === "danger" ? "h-4 w-4 shrink-0 text-danger" : "h-4 w-4 shrink-0 text-warn"} aria-hidden />
                    <span className="flex-1 text-fg-muted">{item.label}</span>
                    <span className="text-xs text-accent">Review</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border hairline bg-bg-raised">
          <div className="border-b hairline px-4 py-3">
            <h2 className="text-sm font-semibold">Service pulse</h2>
            <p className="mt-0.5 text-[11px] text-fg-faint">Current adoption and automation workload.</p>
          </div>
          <dl className="grid grid-cols-2 gap-px bg-line/60">
            <Pulse icon={UserPlus} label="Verified users" value={`${snapshot.users.verified}/${snapshot.users.total}`} />
            <Pulse icon={ShieldAlert} label="MFA enabled" value={snapshot.users.mfaEnabled.toLocaleString()} />
            <Pulse icon={Bot} label="Active agents" value={snapshot.workload.activeAgentSessions.toLocaleString()} />
            <Pulse icon={FileClock} label="Automations" value={(snapshot.automation.enabledWatches + snapshot.automation.enabledReports).toLocaleString()} />
          </dl>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border hairline bg-bg-raised">
          <SectionHeader title="Recent users" href="/admin/users" />
          <ul className="divide-y hairline">
            {recentUsers.map((user) => (
              <li key={user.id}>
                <Link href={`/admin/users/${user.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-bg/50">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-fg">{user.email}</p>
                    <p className="mt-0.5 text-[11px] text-fg-faint">{user.connectionCount} connection{user.connectionCount === 1 ? "" : "s"} · joined {relativeFromNow(user.createdAt) ?? "recently"}</p>
                  </div>
                  <AdminStatus tone={user.emailUndeliverableAt ? "danger" : user.emailVerifiedAt ? "ok" : "warn"}>
                    {user.emailUndeliverableAt ? "Suppressed" : user.emailVerifiedAt ? user.plan : "Unverified"}
                  </AdminStatus>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border hairline bg-bg-raised">
          <SectionHeader title="Operator activity" href="/admin/actions" />
          {recentActions.length === 0 ? (
            <p className="px-4 py-8 text-sm text-fg-muted">No admin mutations recorded yet.</p>
          ) : (
            <ul className="divide-y hairline">
              {recentActions.map((action) => (
                <li key={action.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-fg">{humanize(action.action)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-fg-faint">{action.adminEmail ?? "Unknown operator"} → {action.targetEmail ?? "system"}</p>
                  </div>
                  <time className="shrink-0 text-[11px] text-fg-faint" dateTime={new Date(action.createdAt).toISOString()}>{relativeFromNow(action.createdAt) ?? "-"}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Pulse({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return <div className="bg-bg-raised p-4"><Icon className="h-3.5 w-3.5 text-accent" aria-hidden /><dt className="mt-2 text-[10px] uppercase tracking-[0.14em] text-fg-faint">{label}</dt><dd className="mt-1 font-display text-lg tabular-nums">{value}</dd></div>;
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return <div className="flex items-center justify-between gap-3 border-b hairline px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Link href={href} className="text-xs text-accent hover:underline">View all</Link></div>;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
