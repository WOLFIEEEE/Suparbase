import type { Metadata } from "next";
import Link from "next/link";
import { Search, SlidersHorizontal, UserRoundSearch } from "lucide-react";
import { AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import {
  countUsers,
  listUsers,
  type AdminUserVerificationFilter,
} from "@/server/admin/repo";
import type { Plan, SubscriptionStatus } from "@/server/schema";
import { cn } from "@/lib/ui/cn";
import { relativeFromNow } from "@/lib/ui/time";

export const metadata: Metadata = { title: "Admin · Users" };

const PLANS: Plan[] = ["free", "hosted", "team"];
const STATUSES: SubscriptionStatus[] = ["none", "trialing", "active", "on_hold", "cancelled", "expired", "failed"];
const VERIFICATIONS: AdminUserVerificationFilter[] = ["verified", "unverified", "suppressed", "deletion"];
const PAGE_SIZE = 50;

interface Props {
  searchParams: Promise<{ q?: string; plan?: string; status?: string; verification?: string; page?: string }>;
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim().slice(0, 120);
  const plan = PLANS.includes(sp.plan as Plan) ? (sp.plan as Plan) : undefined;
  const status = STATUSES.includes(sp.status as SubscriptionStatus) ? (sp.status as SubscriptionStatus) : undefined;
  const verification = VERIFICATIONS.includes(sp.verification as AdminUserVerificationFilter) ? (sp.verification as AdminUserVerificationFilter) : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const filters = { search: search || undefined, plan, status, verification };
  const [users, total] = await Promise.all([
    listUsers({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countUsers(filters),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search || plan || status || verification);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Customer support"
        title="Users"
        description={`${total.toLocaleString()} account${total === 1 ? "" : "s"} match the current view. Search identity, inspect usage and manage entitlements.`}
      />

      <form action="/admin/users" className="grid gap-3 rounded-lg border hairline bg-bg-raised p-4 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_10rem_11rem_11rem_auto]">
        <label className="space-y-1 sm:col-span-2 xl:col-span-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">Search</span>
          <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden /><input name="q" type="search" defaultValue={search} placeholder="Email or name" className="h-10 w-full rounded-md border hairline bg-bg pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70" /></span>
        </label>
        <Select label="Plan" name="plan" value={plan} options={PLANS} />
        <Select label="Subscription" name="status" value={status} options={STATUSES} />
        <Select label="Account state" name="verification" value={verification} options={VERIFICATIONS} />
        <div className="flex items-end gap-2">
          <button type="submit" className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />Apply</button>
          {hasFilters && <Link href="/admin/users" aria-label="Clear filters" className="inline-flex min-h-10 items-center rounded-md border hairline px-3 text-xs text-fg-muted hover:border-line-strong hover:text-fg">Clear</Link>}
        </div>
      </form>

      {users.length === 0 ? (
        <AdminEmptyState icon={UserRoundSearch} title="No matching users" description={hasFilters ? "Adjust or clear the filters to broaden the account search." : "New accounts will appear here after registration."} action={hasFilters ? <Link href="/admin/users" className="text-xs text-accent hover:underline">Clear all filters</Link> : undefined} />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border hairline bg-bg-raised">
            <div className="hidden grid-cols-[minmax(14rem,1.6fr)_9rem_9rem_8rem_7rem] gap-4 border-b hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint md:grid">
              <span>Account</span><span>Entitlement</span><span>Identity</span><span>Usage</span><span>Joined</span>
            </div>
            <ul className="divide-y hairline">
              {users.map((user) => (
                <li key={user.id}>
                  <Link href={`/admin/users/${user.id}`} className="grid min-h-16 cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-bg/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 md:grid-cols-[minmax(14rem,1.6fr)_9rem_9rem_8rem_7rem] md:items-center md:gap-4">
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-fg">{user.email}</p><p className="mt-0.5 truncate text-[11px] text-fg-faint">{user.name ?? "No display name"}</p></div>
                    <div className="flex flex-wrap items-center gap-1.5"><PlanPill plan={user.plan} status={user.status} comped={Boolean(user.grantedByAdmin)} /></div>
                    <div className="flex flex-wrap items-center gap-1.5"><AdminStatus tone={user.emailUndeliverableAt ? "danger" : user.emailVerifiedAt ? "ok" : "warn"}>{user.emailUndeliverableAt ? "Suppressed" : user.emailVerifiedAt ? "Verified" : "Unverified"}</AdminStatus>{user.totpEnabledAt && <span className="text-[10px] font-medium text-accent">MFA</span>}{user.deletionScheduledAt && <span className="text-[10px] font-medium text-danger">Deletion</span>}</div>
                    <p className="text-xs tabular-nums text-fg-muted">{user.connectionCount} owned</p>
                    <p className="text-[11px] text-fg-faint" title={user.createdAt ? formatDate(user.createdAt) : undefined}>{relativeFromNow(user.createdAt) ?? "Unknown"}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Pagination page={page} pages={pages} params={sp} />
        </>
      )}
    </div>
  );
}

function Select({ label, name, value, options }: { label: string; name: string; value?: string; options: readonly string[] }) {
  return <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">{label}</span><select name={name} defaultValue={value ?? ""} className="h-10 w-full rounded-md border hairline bg-bg px-3 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"><option value="">All</option>{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>;
}

function PlanPill({ plan, status, comped }: { plan: string; status: string; comped: boolean }) {
  const entitled = (status === "trialing" || status === "active") && plan !== "free";
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", entitled ? "bg-accent/10 text-accent" : status === "failed" || status === "on_hold" ? "bg-danger/10 text-danger" : "bg-bg text-fg-muted")}>{plan}<span className="text-fg-faint">·</span>{status}{comped && <span className="text-fg-faint">·comp</span>}</span>;
}

function Pagination({ page, pages, params }: { page: number; pages: number; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (next: number) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value && key !== "page") query.set(key, value); query.set("page", String(next)); return `/admin/users?${query}`; };
  return <nav aria-label="User pages" className="flex items-center justify-between text-xs"><Link aria-disabled={page <= 1} href={page > 1 ? href(page - 1) : "#"} className={page <= 1 ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Previous</Link><span className="text-fg-muted">Page {page} of {pages}</span><Link aria-disabled={page >= pages} href={page < pages ? href(page + 1) : "#"} className={page >= pages ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Next</Link></nav>;
}

function formatDate(value: Date | string) { return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium" }); }
