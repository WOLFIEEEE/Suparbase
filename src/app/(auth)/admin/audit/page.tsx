import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, Search } from "lucide-react";
import { AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import { countAuditMatches, searchAuditLog, type AuditSearchParams } from "@/server/admin/audit-search";

export const metadata: Metadata = { title: "Admin · Data audit" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 100;

interface PageProps {
  searchParams: Promise<{ user?: string; conn?: string; schema?: string; table?: string; verb?: string; since?: string; until?: string; page?: string }>;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const explicitFilters = Boolean(sp.user || sp.conn || sp.schema || sp.table || sp.verb || sp.since || sp.until);
  const params: AuditSearchParams = {};
  if (sp.user && UUID_RE.test(sp.user)) params.userId = sp.user;
  if (sp.conn && UUID_RE.test(sp.conn)) params.connectionId = sp.conn;
  if (sp.schema) params.schemaName = sp.schema.trim().slice(0, 64);
  if (sp.table) params.tableName = sp.table.trim().slice(0, 128);
  if (sp.verb === "insert" || sp.verb === "update" || sp.verb === "delete") params.verb = sp.verb;
  if (sp.since) { const value = new Date(sp.since); if (Number.isFinite(value.getTime())) params.since = value; }
  if (sp.until) { const value = new Date(sp.until); if (Number.isFinite(value.getTime())) params.until = value; }
  if (!explicitFilters) params.since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [rows, total] = await Promise.all([
    searchAuditLog({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countAuditMatches(params),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <div className="space-y-6">
    <AdminPageHeader eyebrow="Forensics" title="Data audit" description={explicitFilters ? "Filtered customer-project mutations captured by the encrypted proxy." : "Showing every customer-project mutation recorded during the last 24 hours."} actions={<Link href="/admin/actions" className="inline-flex min-h-10 items-center rounded-md border hairline px-3 text-xs font-medium text-fg-muted hover:border-line-strong hover:text-fg">Operator actions</Link>} />

    <form action="/admin/audit" className="grid grid-cols-1 gap-3 rounded-lg border hairline bg-bg-raised p-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="User ID" name="user" defaultValue={sp.user} placeholder="UUID from users" />
      <Field label="Connection ID" name="conn" defaultValue={sp.conn} placeholder="Connection UUID" />
      <Field label="Schema" name="schema" defaultValue={sp.schema} placeholder="public" />
      <Field label="Table" name="table" defaultValue={sp.table} placeholder="users" />
      <label className="space-y-1"><span className="field-label">Verb</span><select name="verb" defaultValue={sp.verb ?? ""} className="admin-input capitalize"><option value="">All verbs</option><option value="insert">Insert</option><option value="update">Update</option><option value="delete">Delete</option></select></label>
      <Field label="Since" name="since" type="datetime-local" defaultValue={sp.since} />
      <Field label="Until" name="until" type="datetime-local" defaultValue={sp.until} />
      <div className="flex items-end gap-2"><button type="submit" className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"><Search className="h-3.5 w-3.5" aria-hidden />Search</button>{explicitFilters && <Link href="/admin/audit" className="inline-flex min-h-10 items-center rounded-md border hairline px-3 text-xs text-fg-muted hover:border-line-strong hover:text-fg">Reset</Link>}</div>
    </form>

    {rows.length === 0 ? <AdminEmptyState icon={FileSearch} title="No audit activity" description="No data mutations match this time range and filter combination." /> : <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-fg-muted">Showing {rows.length} of {total.toLocaleString()} mutations.</p><p className="text-[11px] text-fg-faint">Snapshots can contain customer data; inspect only when necessary.</p></div>
      <div className="overflow-x-auto rounded-lg border hairline bg-bg-raised"><table className="w-full min-w-[920px] text-xs"><thead><tr className="border-b hairline text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint"><th className="px-4 py-3">When</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Snapshot</th></tr></thead><tbody className="divide-y hairline">{rows.map((row) => <tr key={row.id} className="align-top hover:bg-bg/40"><td className="whitespace-nowrap px-4 py-3 font-mono text-fg-faint">{formatDateTime(row.createdAt)}</td><td className="max-w-48 px-4 py-3"><p className="truncate text-fg-muted">{row.userEmail ?? "Deleted user"}</p>{row.userId && <Link href={`/admin/users/${row.userId}`} className="mt-1 block font-mono text-[10px] text-accent hover:underline">Open account</Link>}</td><td className="max-w-40 px-4 py-3"><p className="truncate text-fg-muted">{row.connectionName ?? "Deleted project"}</p><p className="mt-1 truncate font-mono text-[10px] text-fg-faint">{row.connectionId ?? "—"}</p></td><td className="px-4 py-3 font-mono text-fg">{row.schemaName}.{row.tableName}</td><td className="px-4 py-3"><div className="flex flex-col items-start gap-1"><AdminStatus tone={row.verb === "delete" ? "danger" : row.verb === "update" ? "warn" : "ok"}>{row.verb}</AdminStatus><span className={row.httpStatus >= 400 ? "font-mono text-danger" : "font-mono text-fg-faint"}>HTTP {row.httpStatus}</span></div></td><td className="max-w-40 px-4 py-3 font-mono text-[10px] text-fg-muted">{compactJson(row.primaryKey)}</td><td className="px-4 py-3"><details><summary className="cursor-pointer text-fg-muted hover:text-fg">Inspect</summary><div className="mt-2 grid w-80 gap-2"><Snapshot label="Before" value={row.beforeRow} /><Snapshot label="After" value={row.afterRow} />{row.sessionId && <p className="font-mono text-[10px] text-fg-faint">session {row.sessionId}</p>}</div></details></td></tr>)}</tbody></table></div>
      <Pagination page={page} pages={pages} params={sp} />
    </>}
  </div>;
}

function Field({ label, name, defaultValue, placeholder, type = "text" }: { label: string; name: string; defaultValue?: string; placeholder?: string; type?: string }) { return <label className="space-y-1"><span className="field-label">{label}</span><input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="admin-input" /></label>; }
function Snapshot({ label, value }: { label: string; value: unknown }) { return <div><p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-fg-faint">{label}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-bg p-2 text-[10px] leading-4 text-fg-muted">{value == null ? "Not captured" : safeJson(value)}</pre></div>; }
function Pagination({ page, pages, params }: { page: number; pages: number; params: Record<string, string | undefined> }) { if (pages <= 1) return null; const href = (next: number) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value && key !== "page") query.set(key, value); query.set("page", String(next)); return `/admin/audit?${query}`; }; return <nav aria-label="Audit pages" className="flex items-center justify-between text-xs"><Link aria-disabled={page <= 1} href={page > 1 ? href(page - 1) : "#"} className={page <= 1 ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Previous</Link><span className="text-fg-muted">Page {page} of {pages}</span><Link aria-disabled={page >= pages} href={page < pages ? href(page + 1) : "#"} className={page >= pages ? "pointer-events-none text-fg-faint" : "text-accent hover:underline"}>Next</Link></nav>; }
function compactJson(value: unknown) { if (value == null) return "—"; try { const text = JSON.stringify(value); return text.length > 80 ? `${text.slice(0, 77)}…` : text; } catch { return "Unavailable"; } }
function safeJson(value: unknown) { try { return JSON.stringify(value, null, 2).slice(0, 12_000); } catch { return "Unavailable"; } }
function formatDateTime(value: Date | string) { return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" }); }
