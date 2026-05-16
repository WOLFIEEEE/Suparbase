import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { countAuditMatches, searchAuditLog, type AuditSearchParams } from "@/server/admin/audit-search";

export const metadata: Metadata = {
  title: "Admin · Audit search",
};

interface PageProps {
  searchParams: Promise<{
    user?: string;
    conn?: string;
    schema?: string;
    table?: string;
    verb?: string;
    since?: string;
    until?: string;
  }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Only apply filters that pass shape validation. Anything weird is
  // silently dropped — the search form clears it on next submit.
  const params: AuditSearchParams = {};
  if (sp.user && UUID_RE.test(sp.user)) params.userId = sp.user;
  if (sp.conn && UUID_RE.test(sp.conn)) params.connectionId = sp.conn;
  if (sp.schema) params.schemaName = sp.schema.slice(0, 64);
  if (sp.table) params.tableName = sp.table.slice(0, 128);
  if (sp.verb === "insert" || sp.verb === "update" || sp.verb === "delete") {
    params.verb = sp.verb;
  }
  if (sp.since) {
    const d = new Date(sp.since);
    if (!Number.isNaN(d.getTime())) params.since = d;
  }
  if (sp.until) {
    const d = new Date(sp.until);
    if (!Number.isNaN(d.getTime())) params.until = d;
  }

  // Only run the query when at least one filter is set — otherwise
  // we'd return every audit row in the system (cheap with the
  // index, but useless to the operator).
  const hasFilter = Object.keys(params).length > 0;
  const [rows, total] = hasFilter
    ? await Promise.all([searchAuditLog(params), countAuditMatches(params)])
    : [[], 0];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Audit search</h1>
        <p className="text-sm text-fg-muted">
          Filter the global <code className="font-mono">audit_log</code> table for
          forensic queries. Each row is a single proxied write through the
          encrypted vault.
        </p>
      </header>

      <form action="/admin/audit" className="grid grid-cols-1 gap-3 rounded-lg border hairline bg-bg-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="User id (uuid)" name="user" defaultValue={sp.user ?? ""} placeholder="paste from /admin/users" />
        <Field label="Connection id" name="conn" defaultValue={sp.conn ?? ""} placeholder="uuid" />
        <Field label="Schema" name="schema" defaultValue={sp.schema ?? ""} placeholder="public" />
        <Field label="Table" name="table" defaultValue={sp.table ?? ""} placeholder="users" />
        <SelectField label="Verb" name="verb" defaultValue={sp.verb ?? ""} options={["", "insert", "update", "delete"]} />
        <Field label="Since" name="since" type="datetime-local" defaultValue={sp.since ?? ""} />
        <Field label="Until" name="until" type="datetime-local" defaultValue={sp.until ?? ""} />
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90"
          >
            <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Search
          </button>
          <Link
            href="/admin/audit"
            className="inline-flex h-9 items-center rounded-md border hairline px-3 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
          >
            Clear
          </Link>
        </div>
      </form>

      {!hasFilter ? (
        <div className="rounded-lg border hairline bg-bg-raised/40 p-6 text-sm text-fg-muted">
          Apply at least one filter to run a search. Use{" "}
          <Link href="/admin/users" className="text-accent hover:underline">
            /admin/users
          </Link>{" "}
          to find a user&apos;s id.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border hairline bg-bg-raised/40 p-6 text-sm text-fg-muted">
          No audit rows match these filters.
        </div>
      ) : (
        <>
          <p className="text-xs text-fg-muted">
            Showing {rows.length} of {total.toLocaleString()} matches.
          </p>
          <div className="overflow-x-auto rounded-lg border hairline bg-bg-raised">
            <table className="w-full text-xs">
              <thead className="bg-bg-raised/60 text-left">
                <tr className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  <th scope="col" className="px-4 py-2">When</th>
                  <th scope="col" className="px-4 py-2">User</th>
                  <th scope="col" className="px-4 py-2">Connection</th>
                  <th scope="col" className="px-4 py-2">Table</th>
                  <th scope="col" className="px-4 py-2">Verb</th>
                  <th scope="col" className="px-4 py-2">HTTP</th>
                  <th scope="col" className="px-4 py-2">PK</th>
                </tr>
              </thead>
              <tbody className="divide-y hairline">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-bg/30">
                    <td className="px-4 py-2 font-mono text-fg-faint">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2 font-mono text-fg-muted">{r.userEmail ?? "—"}</td>
                    <td className="px-4 py-2 text-fg-muted">{r.connectionName ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-fg">
                      {r.schemaName}.{r.tableName}
                    </td>
                    <td className="px-4 py-2 font-mono">
                      <VerbPill verb={r.verb} />
                    </td>
                    <td className="px-4 py-2 font-mono text-fg-muted">{r.httpStatus}</td>
                    <td className="px-4 py-2 font-mono text-fg-faint">
                      {r.primaryKey ? JSON.stringify(r.primaryKey).slice(0, 40) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border hairline bg-bg px-2 text-sm focus:border-line-strong focus:outline-none"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: string[];
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-9 w-full rounded-md border hairline bg-bg px-2 text-sm focus:border-line-strong focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}

function VerbPill({ verb }: { verb: "insert" | "update" | "delete" }) {
  const tone =
    verb === "insert"
      ? "bg-accent/15 text-accent"
      : verb === "update"
      ? "bg-amber-500/15 text-amber-400"
      : "bg-danger/15 text-danger";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] ${tone}`}>
      {verb}
    </span>
  );
}

function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
