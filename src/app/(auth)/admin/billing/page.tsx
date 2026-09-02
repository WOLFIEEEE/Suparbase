import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, Clock3, Filter, ReceiptText, Webhook } from "lucide-react";
import { AdminEmptyState, AdminMetric, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import {
  countAdminBillingEvents,
  getAdminBillingEventStats,
  listAdminBillingEvents,
  listBillingEventTypes,
} from "@/server/admin/billing";
import { relativeFromNow } from "@/lib/ui/time";

export const metadata: Metadata = { title: "Admin · Billing events" };
const PAGE_SIZE = 100;

export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<{ q?: string; event?: string; applied?: string; page?: string }> }) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim().slice(0, 160);
  const applied: "applied" | "pending" | undefined =
    sp.applied === "applied" || sp.applied === "pending" ? sp.applied : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [eventTypes, stats] = await Promise.all([listBillingEventTypes(), getAdminBillingEventStats()]);
  const eventType = eventTypes.includes(sp.event ?? "") ? sp.event : undefined;
  const filters = { query: query || undefined, eventType, applied };
  const [events, total] = await Promise.all([
    listAdminBillingEvents({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countAdminBillingEvents(filters),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(query || eventType || applied);

  return <div className="space-y-6">
    <AdminPageHeader eyebrow="Revenue operations" title="Billing events" description="Verified Dodo webhook receipts, subscription attribution and apply state. Use this when checkout succeeds but entitlement does not update." />
    <section aria-label="Billing event metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <AdminMetric icon={Webhook} label="Total receipts" value={stats.total.toLocaleString()} />
      <AdminMetric icon={Activity} label="Received, 24h" value={stats.received24h.toLocaleString()} />
      <AdminMetric icon={AlertTriangle} label="Awaiting apply" value={stats.pending.toLocaleString()} tone={stats.pending > 0 ? "danger" : "ok"} />
      <AdminMetric icon={Clock3} label="Latest receipt" value={stats.lastReceivedAt ? relativeFromNow(stats.lastReceivedAt) ?? "—" : "—"} detail={stats.lastReceivedAt ? formatDateTime(stats.lastReceivedAt) : "No webhook received"} />
    </section>

    {stats.pending > 0 && <section className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{stats.pending} event{stats.pending === 1 ? "" : "s"} require attention</h2><p className="mt-1 text-xs leading-5 text-fg-muted">The receipt was stored but no successful subscription update was recorded. Dodo retries failed deliveries; review application logs if an event remains pending.</p></div><Link href="/admin/billing?applied=pending" className="shrink-0 text-xs text-accent hover:underline">Filter pending</Link></section>}

    <form action="/admin/billing" className="grid gap-3 rounded-lg border hairline bg-bg-raised p-4 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_14rem_10rem_auto]">
      <label className="space-y-1"><span className="field-label">Search</span><input name="q" type="search" defaultValue={query} placeholder="Email, subscription or webhook ID" className="admin-input" /></label>
      <label className="space-y-1"><span className="field-label">Event type</span><select name="event" defaultValue={eventType ?? ""} className="admin-input"><option value="">All event types</option>{eventTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="space-y-1"><span className="field-label">Apply state</span><select name="applied" defaultValue={applied ?? ""} className="admin-input"><option value="">All states</option><option value="applied">Applied</option><option value="pending">Pending</option></select></label>
      <div className="flex items-end gap-2"><button type="submit" className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"><Filter className="h-3.5 w-3.5" aria-hidden />Apply</button>{hasFilters && <Link href="/admin/billing" className="inline-flex min-h-10 items-center rounded-md border hairline px-3 text-xs text-fg-muted hover:border-line-strong hover:text-fg">Clear</Link>}</div>
    </form>

    {events.length === 0 ? <AdminEmptyState icon={ReceiptText} title="No billing events" description={hasFilters ? "No webhook receipts match these filters." : "Events will appear after Dodo sends a verified webhook."} /> : <>
      <p className="text-xs text-fg-muted">Showing {events.length} of {total.toLocaleString()} matching receipts.</p>
      <div className="overflow-x-auto rounded-lg border hairline bg-bg-raised"><table className="w-full min-w-[940px] text-xs"><thead><tr className="border-b hairline text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint"><th className="px-4 py-3">Received</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Subscription</th><th className="px-4 py-3">Webhook</th><th className="px-4 py-3">Payload</th></tr></thead><tbody className="divide-y hairline">{events.map((event) => <tr key={event.id} className="align-top hover:bg-bg/40"><td className="whitespace-nowrap px-4 py-3 font-mono text-fg-faint">{formatDateTime(event.receivedAt)}</td><td className="px-4 py-3 font-mono text-fg">{event.eventType}</td><td className="px-4 py-3"><AdminStatus tone={event.appliedAt ? "ok" : "danger"}>{event.appliedAt ? "Applied" : "Pending"}</AdminStatus></td><td className="max-w-48 px-4 py-3">{event.userId ? <Link href={`/admin/users/${event.userId}`} className="block truncate text-accent hover:underline">{event.userEmail ?? event.userId}</Link> : <span className="text-fg-faint">Unattributed</span>}</td><td className="max-w-48 px-4 py-3 font-mono text-fg-muted"><span className="block truncate" title={event.dodoSubscriptionId ?? undefined}>{event.dodoSubscriptionId ?? "—"}</span></td><td className="max-w-40 px-4 py-3 font-mono text-[10px] text-fg-faint"><span className="block truncate" title={event.webhookId}>{event.webhookId}</span></td><td className="px-4 py-3"><details><summary className="cursor-pointer text-fg-muted hover:text-fg">Inspect</summary><pre className="mt-2 max-h-64 w-96 overflow-auto whitespace-pre-wrap break-all rounded bg-bg p-2 text-[10px] leading-4 text-fg-muted">{safeJson(event.payload)}</pre></details></td></tr>)}</tbody></table></div>
      <Pagination page={page} pages={pages} params={sp} />
    </>}
  </div>;
}

function Pagination({ page, pages, params }: { page: number; pages: number; params: Record<string, string | undefined> }) { if (pages <= 1) return null; const href = (next: number) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value && key !== "page") query.set(key, value); query.set("page", String(next)); return `/admin/billing?${query}`; }; return <nav aria-label="Billing event pages" className="flex items-center justify-between text-xs"><Link aria-disabled={page <= 1} href={page > 1 ? href(page - 1) : "#"} className={page <= 1 ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Previous</Link><span className="text-fg-muted">Page {page} of {pages}</span><Link aria-disabled={page >= pages} href={page < pages ? href(page + 1) : "#"} className={page >= pages ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Next</Link></nav>; }
function safeJson(value: unknown) { try { return JSON.stringify(value, null, 2).slice(0, 16_000); } catch { return "Payload unavailable"; } }
function formatDateTime(value: Date | string) { return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" }); }
