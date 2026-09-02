import type { Metadata } from "next";
import Link from "next/link";
import { FileClock, Filter } from "lucide-react";
import { AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import { countAdminActions, listAdminActions, type AdminActionName } from "@/server/admin/repo";

export const metadata: Metadata = { title: "Admin · Operator actions" };

const ACTIONS: AdminActionName[] = ["grant_plan", "reset_subscription", "clear_email_suppression", "revoke_sessions", "revoke_plan", "extend_trial"];
const PAGE_SIZE = 100;

export default async function AdminActionsPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const sp = await searchParams;
  const action = ACTIONS.includes(sp.action as AdminActionName) ? (sp.action as AdminActionName) : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [rows, total] = await Promise.all([
    listAdminActions({ action, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countAdminActions(action),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <div className="space-y-6">
    <AdminPageHeader eyebrow="Accountability" title="Operator actions" description="Append-only history of customer-state changes initiated from the admin panel." />
    <form action="/admin/actions" className="flex flex-col gap-3 rounded-lg border hairline bg-bg-raised p-4 sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1 space-y-1"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Action</span><select name="action" defaultValue={action ?? ""} className="h-10 w-full rounded-md border hairline bg-bg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"><option value="">All actions</option>{ACTIONS.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>
      <button type="submit" className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"><Filter className="h-3.5 w-3.5" aria-hidden />Apply</button>
      {action && <Link href="/admin/actions" className="inline-flex min-h-10 items-center justify-center rounded-md border hairline px-4 text-sm text-fg-muted hover:border-line-strong hover:text-fg">Clear</Link>}
    </form>
    {rows.length === 0 ? <AdminEmptyState icon={FileClock} title="No operator actions" description="Customer-state mutations performed from this panel will appear here." /> : <>
      <p className="text-xs text-fg-muted">Showing {rows.length} of {total.toLocaleString()} actions.</p>
      <div className="overflow-x-auto rounded-lg border hairline bg-bg-raised"><table className="w-full min-w-[760px] text-xs"><thead><tr className="border-b hairline text-left text-[10px] uppercase tracking-[0.16em] text-fg-faint"><th className="px-4 py-3">When</th><th className="px-4 py-3">Operator</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Details</th></tr></thead><tbody className="divide-y hairline">{rows.map((row) => <tr key={row.id} className="hover:bg-bg/40"><td className="whitespace-nowrap px-4 py-3 font-mono text-fg-faint">{formatDateTime(row.createdAt)}</td><td className="px-4 py-3 text-fg-muted">{row.adminEmail ?? row.adminUserId}</td><td className="px-4 py-3"><AdminStatus tone={row.action.includes("reset") || row.action.includes("revoke") ? "warn" : "neutral"}>{humanize(row.action)}</AdminStatus></td><td className="px-4 py-3">{row.targetUserId ? <Link href={`/admin/users/${row.targetUserId}`} className="text-accent hover:underline">{row.targetEmail ?? row.targetUserId}</Link> : <span className="text-fg-faint">System</span>}</td><td className="max-w-xs px-4 py-3"><details><summary className="cursor-pointer text-fg-muted hover:text-fg">Inspect</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-bg p-2 text-[10px] leading-4 text-fg-muted">{safeJson(row.details)}</pre></details></td></tr>)}</tbody></table></div>
      {pages > 1 && <Pagination page={page} pages={pages} action={action} />}
    </>}
  </div>;
}

function Pagination({ page, pages, action }: { page: number; pages: number; action?: string }) { const href = (next: number) => `/admin/actions?${new URLSearchParams({ ...(action ? { action } : {}), page: String(next) })}`; return <nav aria-label="Operator action pages" className="flex items-center justify-between text-xs"><Link aria-disabled={page <= 1} href={page > 1 ? href(page - 1) : "#"} className={page <= 1 ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Previous</Link><span className="text-fg-muted">Page {page} of {pages}</span><Link aria-disabled={page >= pages} href={page < pages ? href(page + 1) : "#"} className={page >= pages ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Next</Link></nav>; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function safeJson(value: unknown) { try { return JSON.stringify(value, null, 2).slice(0, 8000); } catch { return "Details unavailable"; } }
function formatDateTime(value: Date | string) { return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
