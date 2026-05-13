"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { useRows } from "@/lib/api/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ListParams } from "@/lib/pgrest/rows";
import type { Row } from "@/lib/types/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PaginationBar } from "@/components/data/PaginationBar";
import { RowDrawer } from "@/components/row/RowDrawer";
import { PresetHeader } from "./shared/PresetHeader";
import { PresetSwitcher } from "@/components/workspace/PresetSwitcher";
import { StatusPill } from "./shared/StatusPill";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { PresetProps } from "./types";

const EMAIL_PATTERNS = ["email", "primary_email"];
const NAME_PATTERNS = ["display_name", "full_name", "name"];
const HANDLE_PATTERNS = ["username", "handle", "login"];
const AVATAR_PATTERNS = ["avatar_url", "avatar", "image", "photo_url", "picture"];
const ROLE_PATTERNS = ["role", "kind", "type", "tier"];
const STATUS_PATTERNS = ["status", "state"];
const LAST_SEEN_PATTERNS = ["last_sign_in_at", "last_seen_at", "last_login_at"];

function findColumn(table: PresetProps["table"], names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

function avatarFallback(label: string | null | undefined): string {
  if (!label) return "?";
  const cleaned = label.trim();
  if (!cleaned) return "?";
  return cleaned.slice(0, 1).toUpperCase();
}

export default function UsersAdmin({ connectionId, table, analysis }: PresetProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const emailCol = findColumn(table, EMAIL_PATTERNS);
  const nameCol = findColumn(table, NAME_PATTERNS) ?? analysis?.titleColumn ?? null;
  const handleCol = findColumn(table, HANDLE_PATTERNS);
  const avatarCol = findColumn(table, AVATAR_PATTERNS);
  const roleCol = findColumn(table, ROLE_PATTERNS);
  const statusCol = findColumn(table, STATUS_PATTERNS) ?? analysis?.statusColumn ?? null;
  const lastSeenCol = findColumn(table, LAST_SEEN_PATTERNS);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 25 as const;
  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: undefined,
      search: debouncedSearch || undefined,
    }),
    [page, debouncedSearch],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const rows = data?.rows ?? [];

  const [drawerRow, setDrawerRow] = useState<Row | null>(null);

  const displayName = analysis?.displayName ?? "Users";

  if (error) {
    return (
      <div className="space-y-4">
        <PresetHeader
          connectionId={connectionId}
          tableName={table.name}
          displayName={displayName}
          analysis={analysis}
        />
        <ErrorBanner
          error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PresetHeader
        connectionId={connectionId}
        tableName={table.name}
        displayName={displayName}
        analysis={analysis}
        actions={
          <div className="flex gap-2">
            <PresetSwitcher active="users" />
            {table.kind === "table" && table.primaryKey.length > 0 && (
              <Button asChild>
                <Link href={`/c/${connectionId}/tables/${encodeURIComponent(table.name)}/new`}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Invite user
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input
            placeholder="Search by email, name, handle…"
            className="pl-9 pr-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search users in ${table.name}`}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() =>
            qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] })
          }
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {isLoading && rows.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-20 w-full" />
              </li>
            ))
          : rows.length === 0
          ? (
              <li className="col-span-full rounded border hairline bg-bg-sunken px-6 py-12 text-center text-sm text-fg-muted">
                {debouncedSearch ? "No users match this search." : "No users yet."}
              </li>
            )
          : rows.map((row, idx) => {
              const email = emailCol ? (row[emailCol] as string | null | undefined) : null;
              const name = nameCol ? (row[nameCol] as string | null | undefined) : null;
              const handle = handleCol ? (row[handleCol] as string | null | undefined) : null;
              const avatar = avatarCol ? (row[avatarCol] as string | null | undefined) : null;
              const role = roleCol ? row[roleCol] : null;
              const status = statusCol ? (row[statusCol] as string | null | undefined) : null;
              const lastSeen = lastSeenCol ? row[lastSeenCol] : null;
              const display = name || email || handle || (row[table.primaryKey[0] ?? "id"] as string | undefined) || "user";
              return (
                <li key={`u-${idx}`}>
                  <button
                    type="button"
                    onClick={() => setDrawerRow(row)}
                    className="flex w-full items-center gap-3 rounded border hairline bg-bg-raised p-3 text-left transition-colors hover:border-line-strong hover:bg-bg-raised/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-sunken">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center font-mono text-xs text-fg-muted">
                          {avatarFallback(String(display))}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{String(display)}</span>
                        {status != null && <StatusPill value={String(status)} />}
                      </div>
                      <div className="flex items-center gap-3 truncate text-xs text-fg-muted">
                        {email && (
                          <span className="inline-flex min-w-0 items-center gap-1 truncate">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{email}</span>
                          </span>
                        )}
                        {handle && handle !== name && (
                          <span className="truncate">@{handle}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right text-[10px]">
                      {role != null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-fg-muted">
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          {String(role)}
                        </span>
                      )}
                      {lastSeen != null && (
                        <span className="text-fg-faint">
                          seen {new Date(String(lastSeen)).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
      </ul>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalCount={data?.totalCount ?? null}
        onPageChange={(p) => {
          const url = new URLSearchParams(sp.toString());
          url.set("page", String(Math.max(1, p)));
          router.push(`?${url.toString()}`);
        }}
      />

      <p className={cn("text-[11px] text-fg-faint")}>
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: users table"}
      </p>

      <RowDrawer table={table} row={drawerRow} onClose={() => setDrawerRow(null)} />
    </div>
  );
}
