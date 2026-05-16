import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { listUsers } from "@/server/admin/repo";
import { cn } from "@/lib/ui/cn";

export const metadata: Metadata = {
  title: "Admin · Users",
};

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const search = (params?.q ?? "").trim();
  const users = await listUsers({ search: search || undefined, limit: 200 });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-display-md">Users</h1>
        <p className="text-sm text-fg-muted">
          {users.length === 200
            ? "Showing the most recent 200 — narrow with search to find specific accounts."
            : `${users.length} user${users.length === 1 ? "" : "s"} found.`}
        </p>
      </header>

      <form action="/admin/users" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Search by email or name"
            className="h-9 w-full rounded-md border hairline bg-bg-raised pl-9 pr-3 text-sm focus:border-line-strong focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border hairline px-4 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
        >
          Search
        </button>
      </form>

      <ul className="divide-y hairline rounded-lg border hairline bg-bg-raised">
        {users.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/users/${u.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-bg-raised/60"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate font-mono text-xs text-fg-muted">{u.email}</p>
                <p className="text-xs text-fg-faint">
                  {u.name ?? "—"} · joined {u.createdAt ? formatDate(u.createdAt) : "?"} · {u.connectionCount} conn
                  {u.connectionCount === 1 ? "" : "s"}
                </p>
              </div>
              <PlanPill plan={u.plan} status={u.status} grantedByAdmin={Boolean(u.grantedByAdmin)} />
              <ChevronRight className="h-4 w-4 text-fg-faint" aria-hidden />
            </Link>
          </li>
        ))}
        {users.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-fg-muted">
            {search ? (
              <>
                No users match <strong className="text-fg">{search}</strong>.{" "}
                <Link href="/admin/users" className="text-accent hover:underline">
                  Clear search
                </Link>
              </>
            ) : (
              "No users yet."
            )}
          </li>
        )}
      </ul>
    </div>
  );
}

function PlanPill({
  plan,
  status,
  grantedByAdmin,
}: {
  plan: string;
  status: string;
  grantedByAdmin: boolean;
}) {
  const isPaid = (status === "trialing" || status === "active") && plan !== "free";
  const tone = isPaid
    ? "bg-accent/15 text-accent"
    : status === "cancelled" || status === "expired" || status === "on_hold" || status === "failed"
    ? "bg-amber-500/15 text-amber-400"
    : "bg-bg/60 text-fg-faint";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        tone,
      )}
    >
      {plan}
      <span className="text-fg-faint">·</span>
      <span>{status}</span>
      {grantedByAdmin && <span className="text-fg-faint">·comp</span>}
    </span>
  );
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { year: "2-digit", month: "short", day: "numeric" });
}
