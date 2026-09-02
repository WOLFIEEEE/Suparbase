import type { Metadata } from "next";
import Link from "next/link";
import { Database, Filter, Search } from "lucide-react";
import { AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import { countAdminConnections, listAdminConnections } from "@/server/admin/repo";
import { relativeFromNow } from "@/lib/ui/time";

export const metadata: Metadata = { title: "Admin · Projects" };
const ROLES = ["anon", "authenticated", "service_role", "unknown"] as const;
const CAPABILITIES = ["postgres", "webhook"] as const;
const ACTIVITY = ["7d", "30d", "stale"] as const;
const PAGE_SIZE = 100;

export default async function AdminProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; capability?: string; activity?: string; page?: string }> }) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim().slice(0, 160);
  const role = ROLES.includes(sp.role as (typeof ROLES)[number]) ? sp.role as (typeof ROLES)[number] : undefined;
  const capability = CAPABILITIES.includes(sp.capability as (typeof CAPABILITIES)[number]) ? sp.capability as (typeof CAPABILITIES)[number] : undefined;
  const activity = ACTIVITY.includes(sp.activity as (typeof ACTIVITY)[number]) ? sp.activity as (typeof ACTIVITY)[number] : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const filters = { search: search || undefined, role, capability, activity };
  const [projects, total] = await Promise.all([
    listAdminConnections({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countAdminConnections(filters),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search || role || capability || activity);

  return <div className="space-y-6">
    <AdminPageHeader eyebrow="Customer infrastructure" title="Projects" description={`${total.toLocaleString()} connected Supabase project${total === 1 ? "" : "s"}. Credentials remain encrypted and are never exposed in this view.`} />
    <form action="/admin/projects" className="grid gap-3 rounded-lg border hairline bg-bg-raised p-4 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_11rem_12rem_11rem_auto]">
      <label className="space-y-1 sm:col-span-2 xl:col-span-1"><span className="field-label">Search</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden /><input name="q" type="search" defaultValue={search} placeholder="Project, hostname or owner" className="admin-input pl-9" /></span></label>
      <Select label="Key role" name="role" value={role} options={ROLES} />
      <Select label="Capability" name="capability" value={capability} options={CAPABILITIES} />
      <Select label="Activity" name="activity" value={activity} options={ACTIVITY} />
      <div className="flex items-end gap-2"><button type="submit" className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90"><Filter className="h-3.5 w-3.5" aria-hidden />Apply</button>{hasFilters && <Link href="/admin/projects" className="inline-flex min-h-10 items-center rounded-md border hairline px-3 text-xs text-fg-muted hover:text-fg">Clear</Link>}</div>
    </form>
    {projects.length === 0 ? <AdminEmptyState icon={Database} title="No matching projects" description={hasFilters ? "Adjust or clear the filters to broaden the project search." : "Connected projects will appear here."} /> : <>
      <div className="overflow-x-auto rounded-lg border hairline bg-bg-raised"><table className="w-full min-w-[860px] text-xs"><thead><tr className="border-b hairline text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint"><th className="px-4 py-3">Project</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Key posture</th><th className="px-4 py-3">Capabilities</th><th className="px-4 py-3">Team</th><th className="px-4 py-3">Last used</th></tr></thead><tbody className="divide-y hairline">{projects.map((project) => <tr key={project.id} className="hover:bg-bg/40"><td className="max-w-64 px-4 py-3"><p className="truncate font-medium text-fg">{project.name}</p><p className="mt-1 truncate font-mono text-[10px] text-fg-faint">{project.hostname}</p></td><td className="max-w-56 px-4 py-3"><Link href={`/admin/users/${project.ownerId}`} className="block truncate text-accent hover:underline">{project.ownerEmail ?? project.ownerId}</Link></td><td className="px-4 py-3"><AdminStatus tone={project.role === "service_role" ? "warn" : project.role === "unknown" ? "danger" : "neutral"}>{project.role}</AdminStatus></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">{project.hasPostgresUrl && <span className="rounded bg-bg px-2 py-1 text-[10px] text-fg-muted">Direct PG</span>}{project.hasAlertWebhook && <span className="rounded bg-bg px-2 py-1 text-[10px] text-fg-muted">Alerts</span>}{!project.hasPostgresUrl && !project.hasAlertWebhook && <span className="text-fg-faint">REST only</span>}</div></td><td className="px-4 py-3 tabular-nums text-fg-muted">{project.memberCount} member{project.memberCount === 1 ? "" : "s"}</td><td className="whitespace-nowrap px-4 py-3 text-fg-muted" title={formatDateTime(project.lastUsedAt)}>{relativeFromNow(project.lastUsedAt) ?? "—"}</td></tr>)}</tbody></table></div>
      <Pagination page={page} pages={pages} params={sp} />
    </>}
  </div>;
}

function Select({ label, name, value, options }: { label: string; name: string; value?: string; options: readonly string[] }) { return <label className="space-y-1"><span className="field-label">{label}</span><select name={name} defaultValue={value ?? ""} className="admin-input capitalize"><option value="">All</option>{options.map((option) => <option key={option} value={option}>{option === "7d" ? "Active, 7 days" : option === "30d" ? "Active, 30 days" : option === "stale" ? "Inactive 30+ days" : option.replaceAll("_", " ")}</option>)}</select></label>; }
function Pagination({ page, pages, params }: { page: number; pages: number; params: Record<string, string | undefined> }) { if (pages <= 1) return null; const href = (next: number) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value && key !== "page") query.set(key, value); query.set("page", String(next)); return `/admin/projects?${query}`; }; return <nav aria-label="Project pages" className="flex items-center justify-between text-xs"><Link aria-disabled={page <= 1} href={page > 1 ? href(page - 1) : "#"} className={page <= 1 ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Previous</Link><span className="text-fg-muted">Page {page} of {pages}</span><Link aria-disabled={page >= pages} href={page < pages ? href(page + 1) : "#"} className={page >= pages ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Next</Link></nav>; }
function formatDateTime(value: Date | string) { return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
