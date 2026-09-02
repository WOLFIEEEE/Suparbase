import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  CalendarClock,
  Database,
  FileSearch,
  KeyRound,
  MailWarning,
  ShieldCheck,
} from "lucide-react";
import { AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import { getAdminSession } from "@/server/admin/guard";
import { getUserDetail } from "@/server/admin/repo";
import { listBillingEventsForUser } from "@/server/billing/repo";
import { listConnections } from "@/server/connections/repo";
import {
  GrantPlanForm,
  ResetSubscriptionForm,
  SupportSecurityActions,
} from "./forms";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Admin · User" };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const user = await getUserDetail(id);
  if (!user) notFound();
  const [events, userConnections, admin] = await Promise.all([
    listBillingEventsForUser(id, 30),
    listConnections(id),
    getAdminSession(),
  ]);

  const identityTone = user.emailUndeliverableAt ? "danger" : user.emailVerifiedAt ? "ok" : "warn";

  return (
    <div className="space-y-7">
      <Link href="/admin/users" className="inline-flex min-h-9 items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All users
      </Link>

      <AdminPageHeader
        eyebrow="Account record"
        title={user.email}
        description={<>{user.name ?? "No display name"} · joined {user.createdAt ? formatDate(user.createdAt) : "unknown"} · <code className="font-mono text-[11px]">{user.id}</code></>}
        actions={<><AdminStatus tone={identityTone}>{user.emailUndeliverableAt ? "Email suppressed" : user.emailVerifiedAt ? "Verified" : "Unverified"}</AdminStatus><AdminStatus tone={user.status === "active" || user.status === "trialing" ? "ok" : user.status === "failed" || user.status === "on_hold" ? "danger" : "neutral"}>{user.plan} · {user.status}</AdminStatus></>}
      />

      <section aria-label="Account summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={ShieldCheck} label="Identity" value={user.totpEnabledAt ? "MFA enabled" : "MFA not enabled"} detail={user.emailVerifiedAt ? `Verified ${formatDate(user.emailVerifiedAt)}` : "Email verification pending"} />
        <SummaryCard icon={KeyRound} label="Sign-in methods" value={[user.hasPassword ? "Password" : null, ...user.authProviders.map(humanize)].filter(Boolean).join(" + ") || "None"} detail={user.lastAuditAt ? `Last data write ${formatDateTime(user.lastAuditAt)}` : "No audited writes"} />
        <SummaryCard icon={Database} label="Workspace access" value={`${user.connectionCount} owned · ${user.sharedConnectionCount} shared`} detail={`${user.auditWrites30d.toLocaleString()} writes in 30 days`} />
        <SummaryCard icon={CalendarClock} label="Lifecycle" value={user.deletionScheduledAt ? "Deletion scheduled" : "Active account"} detail={user.deletionScheduledAt ? `Deletes after ${formatDate(user.deletionScheduledAt)}` : user.currentPeriodEnd ? `Plan through ${formatDate(user.currentPeriodEnd)}` : "No account deletion pending"} tone={user.deletionScheduledAt ? "danger" : undefined} />
      </section>

      {(user.emailUndeliverableAt || user.adminNote) && (
        <section className="grid gap-3 lg:grid-cols-2">
          {user.emailUndeliverableAt && <div className="rounded-lg border border-danger/30 bg-danger/10 p-4"><div className="flex items-start gap-3"><MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /><div><h2 className="text-sm font-semibold text-fg">Email delivery suppressed</h2><p className="mt-1 text-xs leading-5 text-fg-muted">{humanize(user.emailUndeliverableReason ?? "delivery failure")} · {formatDateTime(user.emailUndeliverableAt)}</p></div></div></div>}
          {user.adminNote && <div className="rounded-lg border hairline bg-bg-raised p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Internal note</p><p className="mt-2 text-sm leading-6 text-fg-muted">{user.adminNote}</p></div>}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionTitle title="Entitlement" description="Issue or update a comped plan. This does not create a Dodo charge." />
            <GrantPlanForm targetUserId={user.id} currentPlan={user.plan} currentExpiry={user.currentPeriodEnd} currentNote={user.adminNote} />
          </section>
          <section className="space-y-3">
            <SectionTitle title="Support and security" description="Recovery controls for delivery problems and suspected compromise." />
            <SupportSecurityActions targetUserId={user.id} emailSuppressed={Boolean(user.emailUndeliverableAt)} isSelf={admin?.userId === user.id} />
          </section>
          <section className="space-y-3">
            <SectionTitle title="Reset entitlement" description="Return to Free only after cancelling the upstream Dodo subscription." />
            <ResetSubscriptionForm targetUserId={user.id} />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border hairline bg-bg-raised">
            <div className="border-b hairline px-4 py-3"><h2 className="text-sm font-semibold">Billing identity</h2></div>
            <dl className="divide-y hairline text-xs">
              <DetailRow label="Plan" value={`${user.plan} · ${user.status}`} />
              <DetailRow label="Trial ends" value={user.trialEndsAt ? formatDate(user.trialEndsAt) : "—"} />
              <DetailRow label="Period ends" value={user.currentPeriodEnd ? formatDate(user.currentPeriodEnd) : "—"} />
              <DetailRow label="Dodo customer" value={user.dodoCustomerId ?? "—"} mono />
              <DetailRow label="Subscription" value={user.dodoSubscriptionId ?? "—"} mono />
            </dl>
          </section>
          <Link href={`/admin/audit?user=${user.id}`} className="flex min-h-12 items-center gap-3 rounded-lg border hairline bg-bg-raised px-4 py-3 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"><FileSearch className="h-4 w-4 text-accent" aria-hidden /><span className="flex-1">Search this user&apos;s data audit</span><span className="text-xs text-accent">Open</span></Link>
        </aside>
      </div>

      <section className="space-y-3">
        <SectionTitle title="Connections" description={`${userConnections.length} accessible workspace${userConnections.length === 1 ? "" : "s"}, including owned and shared projects.`} />
        {userConnections.length === 0 ? <p className="rounded-lg border border-dashed hairline p-6 text-center text-sm text-fg-muted">No connected projects.</p> : <div className="overflow-hidden rounded-lg border hairline bg-bg-raised"><ul className="divide-y hairline">{userConnections.map((connection) => <li key={connection.id} className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[minmax(12rem,1fr)_8rem_8rem]"><div className="min-w-0"><p className="truncate font-medium text-fg">{connection.name}</p><p className="mt-0.5 truncate font-mono text-[11px] text-fg-faint">{connection.hostname}</p></div><div><p className="text-[10px] uppercase tracking-wide text-fg-faint">Access</p><p className="mt-1 capitalize text-fg-muted">{connection.myRole}</p></div><div><p className="text-[10px] uppercase tracking-wide text-fg-faint">Last used</p><p className="mt-1 text-fg-muted">{formatDate(connection.lastUsedAt)}</p></div></li>)}</ul></div>}
      </section>

      <section className="space-y-3">
        <SectionTitle title="Recent billing events" description="Latest Dodo webhook receipts associated with this account." />
        {events.length === 0 ? <p className="rounded-lg border border-dashed hairline p-6 text-center text-sm text-fg-muted">No billing events for this account.</p> : <div className="overflow-x-auto rounded-lg border hairline bg-bg-raised"><table className="w-full min-w-[620px] text-xs"><thead><tr className="border-b hairline text-left text-[10px] uppercase tracking-[0.16em] text-fg-faint"><th className="px-4 py-3">Received</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Applied</th><th className="px-4 py-3">Subscription</th></tr></thead><tbody className="divide-y hairline">{events.map((event) => <tr key={event.id} className="hover:bg-bg/40"><td className="whitespace-nowrap px-4 py-3 font-mono text-fg-faint">{formatDateTime(event.receivedAt)}</td><td className="px-4 py-3 font-mono text-fg">{event.eventType}</td><td className="px-4 py-3"><AdminStatus tone={event.appliedAt ? "ok" : "warn"}>{event.appliedAt ? "Applied" : "Pending"}</AdminStatus></td><td className="px-4 py-3 font-mono text-fg-muted">{event.dodoSubscriptionId ?? "—"}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Database; label: string; value: string; detail: string; tone?: "danger" }) { return <article className="rounded-lg border hairline bg-bg-raised p-4"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint"><Icon className={tone === "danger" ? "h-3.5 w-3.5 text-danger" : "h-3.5 w-3.5 text-accent"} aria-hidden />{label}</div><p className={tone === "danger" ? "mt-3 text-sm font-semibold text-danger" : "mt-3 text-sm font-semibold text-fg"}>{value}</p><p className="mt-1 text-[11px] leading-5 text-fg-faint">{detail}</p></article>; }
function SectionTitle({ title, description }: { title: string; description: string }) { return <div><h2 className="font-display text-xl">{title}</h2><p className="mt-1 text-xs leading-5 text-fg-muted">{description}</p></div>; }
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-4 py-3"><dt className="text-fg-faint">{label}</dt><dd className={mono ? "truncate font-mono text-[11px] text-fg-muted" : "text-fg-muted"} title={mono ? value : undefined}>{value}</dd></div>; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function formatDate(value: Date | string) { return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" }); }
function formatDateTime(value: Date | string) { return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
