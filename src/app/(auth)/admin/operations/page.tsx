import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Bot, Database, FileWarning, Gauge, ShieldAlert, Users } from "lucide-react";
import { AdminMetric, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import { getAdminOperationsSnapshot } from "@/server/admin/repo";
import { getAdminSystemChecks } from "@/server/admin/system";

export const metadata: Metadata = { title: "Admin · Operations" };
export const dynamic = "force-dynamic";

export default async function AdminOperationsPage() {
  const [snapshot, checks] = await Promise.all([
    getAdminOperationsSnapshot(),
    Promise.resolve(getAdminSystemChecks()),
  ]);
  const configIssues = checks.filter((check) => check.state === "warn").length;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Reliability"
        title="Operations"
        description="Deployment readiness, product workload and failure signals. Configuration values are reduced to safe status indicators; secrets are never rendered."
      />

      <section aria-label="Operational metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <AdminMetric icon={Database} label="Active projects, 7d" value={snapshot.connections.active7d.toLocaleString()} detail={`${snapshot.connections.total} total`} />
        <AdminMetric icon={Activity} label="Writes, 24h" value={snapshot.workload.auditWrites24h.toLocaleString()} detail="Audited proxy mutations" />
        <AdminMetric icon={Bot} label="Live agents" value={snapshot.workload.activeAgentSessions.toLocaleString()} detail="Seen in last 15 minutes" />
        <AdminMetric icon={FileWarning} label="Open signals" value={(snapshot.workload.criticalFindings + snapshot.workload.failedSyncRuns24h + snapshot.automation.watchErrors + snapshot.automation.reportErrors + snapshot.billing.unappliedEvents).toLocaleString()} detail={`${configIssues} configuration warning${configIssues === 1 ? "" : "s"}`} tone={configIssues > 0 ? "warn" : "ok"} />
      </section>

      <section className="rounded-lg border hairline bg-bg-raised">
        <div className="flex items-center justify-between gap-3 border-b hairline px-4 py-3">
          <div><h2 className="text-sm font-semibold">Deployment configuration</h2><p className="mt-0.5 text-[11px] text-fg-faint">Resolved from the running process.</p></div>
          <AdminStatus tone={configIssues === 0 ? "ok" : "warn"}>{configIssues === 0 ? "Ready" : `${configIssues} warning${configIssues === 1 ? "" : "s"}`}</AdminStatus>
        </div>
        <div className="grid md:grid-cols-2">
          {checks.map((check) => (
            <article key={check.id} className="flex min-h-20 items-start justify-between gap-4 border-b hairline px-4 py-3 odd:md:border-r">
              <div className="min-w-0"><h3 className="text-xs font-medium text-fg">{check.label}</h3><p className="mt-1 text-[11px] leading-5 text-fg-muted">{check.detail}</p></div>
              <AdminStatus tone={check.state === "ok" ? "ok" : check.state === "warn" ? "danger" : "neutral"}>{check.state === "ok" ? "Ready" : check.state === "warn" ? "Action" : check.importance}</AdminStatus>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <SignalGroup id="security" icon={ShieldAlert} title="Security" description="Customer-project security posture" rows={[
          ["Open critical findings", snapshot.workload.criticalFindings, snapshot.workload.criticalFindings > 0 ? "danger" : "ok"],
          ["Service-role connections", snapshot.connections.serviceRole, snapshot.connections.serviceRole > 0 ? "warn" : "neutral"],
          ["Direct Postgres configured", snapshot.connections.directPostgres, "neutral"],
          ["Users with MFA", snapshot.users.mfaEnabled, "neutral"],
        ]} />
        <SignalGroup id="automation" icon={Gauge} title="Automation" description="Scheduled workloads and failures" rows={[
          ["Enabled watches", snapshot.automation.enabledWatches, "neutral"],
          ["Watches with errors", snapshot.automation.watchErrors, snapshot.automation.watchErrors > 0 ? "danger" : "ok"],
          ["Enabled reports", snapshot.automation.enabledReports, "neutral"],
          ["Reports with errors", snapshot.automation.reportErrors, snapshot.automation.reportErrors > 0 ? "danger" : "ok"],
          ["Failed syncs, 24h", snapshot.workload.failedSyncRuns24h, snapshot.workload.failedSyncRuns24h > 0 ? "danger" : "ok"],
        ]} />
        <SignalGroup icon={Users} title="Account health" description="Identity and delivery states" rows={[
          ["Verified accounts", snapshot.users.verified, "ok"],
          ["Email suppressed", snapshot.users.emailSuppressed, snapshot.users.emailSuppressed > 0 ? "warn" : "ok"],
          ["Deletion scheduled", snapshot.users.deletionScheduled, snapshot.users.deletionScheduled > 0 ? "warn" : "neutral"],
          ["Unapplied billing events", snapshot.billing.unappliedEvents, snapshot.billing.unappliedEvents > 0 ? "danger" : "ok"],
        ]} />
      </div>

      <p className="text-xs leading-5 text-fg-faint">For infrastructure-level failures, pair this page with structured application logs and the public <Link href="/api/health" className="text-accent hover:underline">health endpoint</Link>.</p>
    </div>
  );
}

type SignalTone = "ok" | "warn" | "danger" | "neutral";
function SignalGroup({ id, icon: Icon, title, description, rows }: { id?: string; icon: typeof Users; title: string; description: string; rows: Array<[string, number, SignalTone]> }) {
  return <section id={id} className="scroll-mt-24 rounded-lg border hairline bg-bg-raised"><div className="border-b hairline px-4 py-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-accent" aria-hidden /><h2 className="text-sm font-semibold">{title}</h2></div><p className="mt-1 text-[11px] text-fg-faint">{description}</p></div><dl className="divide-y hairline">{rows.map(([label, value, tone]) => <div key={label} className="flex items-center justify-between gap-3 px-4 py-3"><dt className="text-xs text-fg-muted">{label}</dt><dd><AdminStatus tone={tone}>{value.toLocaleString()}</AdminStatus></dd></div>)}</dl></section>;
}
