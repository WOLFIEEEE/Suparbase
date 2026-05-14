"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, MoreHorizontal, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { useRows, useRowCount } from "@/lib/api/hooks";
import { SelectionProvider, useSelection } from "@/components/data/SelectionContext";
import { BulkBar } from "@/components/data/BulkBar";
import { ExportMenu } from "@/components/data/ExportMenu";
import { ImportPanel } from "@/components/data/ImportPanel";
import { FilterBar } from "@/components/data/FilterBar";
import { ViewTabs } from "@/components/data/ViewTabs";
import { parseFilterParams } from "@/lib/filters/parse-url";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ListParams } from "@/lib/pgrest/rows";
import { encodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import type { Row } from "@/lib/types/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PaginationBar } from "@/components/data/PaginationBar";
import { PageHeader, StatTile } from "@/components/workspace/PageHeader";
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
const CREATED_PATTERNS = ["created_at", "inserted_at", "registered_at"];

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

function pkFor(row: Row, primaryKey: string[]): string | null {
  if (primaryKey.length === 0) return null;
  const pk: Record<string, unknown> = {};
  for (const col of primaryKey) {
    if (row[col] == null) return null;
    pk[col] = row[col];
  }
  return encodePkSegment(pk);
}

export default function UsersAdmin(props: PresetProps) {
  // Selection state lives in a context so the BulkBar + row checkboxes share
  // it. Scoped to this component so navigating away resets it.
  return (
    <SelectionProvider>
      <UsersAdminBody {...props} />
    </SelectionProvider>
  );
}

function UsersAdminBody({ connectionId, table, analysis }: PresetProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const primary = analysis?.primary;
  const emailCol = primary?.subtitleColumn ?? findColumn(table, EMAIL_PATTERNS);
  const nameCol =
    primary?.titleColumn ??
    findColumn(table, NAME_PATTERNS) ??
    analysis?.titleColumn ??
    null;
  const handleCol = findColumn(table, HANDLE_PATTERNS);
  const avatarCol = primary?.avatarColumn ?? findColumn(table, AVATAR_PATTERNS);
  const roleCol = findColumn(table, ROLE_PATTERNS);
  const statusCol =
    primary?.badgeColumn ??
    findColumn(table, STATUS_PATTERNS) ??
    analysis?.statusColumn ??
    null;
  const lastSeenCol = findColumn(table, LAST_SEEN_PATTERNS);
  const createdCol = findColumn(table, CREATED_PATTERNS);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 25 as const;
  const filters = useMemo(() => parseFilterParams(sp), [sp]);
  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: createdCol
        ? { column: createdCol, direction: "desc" }
        : undefined,
      search: debouncedSearch || undefined,
      filters,
    }),
    [page, debouncedSearch, createdCol, filters],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const { data: totalCountResult } = useRowCount(connectionId, table);
  const totalCount = totalCountResult?.count ?? null;
  const rows = data?.rows ?? [];

  const displayName = analysis?.displayName ?? "Users";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;

  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName },
  ];

  const visibleCols = (analysis?.listColumns?.length ? analysis.listColumns : table.columns.map((c) => c.name)).filter(
    (c) => !(analysis?.hiddenColumns ?? []).includes(c),
  );
  const [openImport, setOpenImport] = useState(false);

  const headerActions = (
    <>
      <PresetSwitcher active="users" />
      <ExportMenu
        connectionId={connectionId}
        table={table}
        visibleColumns={visibleCols}
        hiddenColumns={analysis?.hiddenColumns ?? []}
      />
      {table.kind === "table" && table.primaryKey.length > 0 && (
        <Button variant="secondary" size="md" onClick={() => setOpenImport(true)}>
          <Upload className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Import</span>
        </Button>
      )}
      <Button
        variant="secondary"
        size="md"
        onClick={() =>
          qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] })
        }
        disabled={isFetching}
        aria-label="Refresh"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden />
        <span className="hidden sm:inline">Refresh</span>
      </Button>
      {table.kind === "table" && table.primaryKey.length > 0 && (
        <Button asChild>
          <Link href={`${tableHref}/new`}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Invite user
          </Link>
        </Button>
      )}
    </>
  );

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumbs={breadcrumbs}
          title={displayName}
          subtitle={<span className="font-mono">{table.schema}.{table.name}</span>}
          eyebrow={analysis && <><Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI: {analysis.category}</>}
          actions={headerActions}
        />
        <ErrorBanner
          error={
            error instanceof AppError
              ? error
              : new AppError("client_bug", String((error as Error).message ?? error))
          }
        />
      </div>
    );
  }

  const visibleStatuses = new Set<string>();
  for (const r of rows) {
    if (!statusCol) break;
    const v = r[statusCol];
    if (v != null) visibleStatuses.add(String(v));
  }

  const selection = useSelection();
  const pageKeys: string[] = [];
  for (const r of rows) {
    const seg = pkFor(r, table.primaryKey);
    if (seg) pageKeys.push(seg);
  }
  const allPageSelected =
    pageKeys.length > 0 && pageKeys.every((k) => selection.isSelected(k));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={displayName}
        subtitle={
          <span className="inline-flex items-center gap-2 font-mono text-xs">
            {table.schema}.{table.name}
            {table.kind === "view" && (
              <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-warn">
                view
              </span>
            )}
          </span>
        }
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI · {analysis.category}
            </>
          ) : null
        }
        actions={headerActions}
        tabs={
          <ViewTabs
            connectionId={connectionId}
            tableSchema={table.schema}
            tableName={table.name}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Total users"
          value={totalCount != null ? totalCount.toLocaleString() : "—"}
          hint={createdCol ? "newest first" : undefined}
        />
        <StatTile
          label="On this page"
          value={rows.length}
          hint={`page ${page}`}
        />
        <StatTile
          label="Columns"
          value={table.columns.length}
          hint={analysis?.hiddenColumns?.length
            ? `${analysis.hiddenColumns.length} hidden`
            : undefined}
        />
        <StatTile
          label="Relations"
          value={(analysis?.relations?.length ?? table.columns.filter((c) => c.fk).length) || 0}
          hint="linked tables"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 rounded border hairline bg-bg-raised px-3 py-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-accent"
            checked={allPageSelected}
            onChange={() => selection.toggleMany(pageKeys, allPageSelected)}
            aria-label="Select all on this page"
          />
          <span className="hidden sm:inline">page</span>
        </label>
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input
            placeholder="Search by name, email, handle…"
            className="pl-9 pr-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search ${displayName.toLowerCase()}`}
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
        {statusCol && visibleStatuses.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
            <span className="text-fg-faint">statuses:</span>
            {Array.from(visibleStatuses).slice(0, 6).map((s) => (
              <StatusPill key={s} value={s} />
            ))}
          </div>
        )}
      </div>

      <FilterBar table={table} />

      <ul className="grid grid-cols-1 gap-2">
        {isLoading && rows.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-[68px] w-full rounded-md" />
            </li>
          ))
        ) : rows.length === 0 ? (
          <li className="surface rounded-md px-6 py-16 text-center text-sm text-fg-muted">
            {debouncedSearch ? (
              <>No users match <span className="font-mono">{debouncedSearch}</span>.</>
            ) : (
              <>No users yet.</>
            )}
          </li>
        ) : (
          rows.map((row, idx) => {
            const pkSegment = pkFor(row, table.primaryKey);
            return (
              <UserRow
                key={`u-${idx}`}
                row={row}
                connectionId={connectionId}
                tableName={table.name}
                primaryKey={table.primaryKey}
                tableHref={tableHref}
                cols={{
                  name: nameCol,
                  email: emailCol,
                  handle: handleCol,
                  avatar: avatarCol,
                  role: roleCol,
                  status: statusCol,
                  lastSeen: lastSeenCol,
                  created: createdCol,
                }}
                selectionKey={pkSegment}
                isSelected={pkSegment ? selection.isSelected(pkSegment) : false}
                onSelectionToggle={pkSegment ? () => selection.toggle(pkSegment) : undefined}
                onView={(pk) => {
                  router.push(`${tableHref}/${pk}`);
                }}
              />
            );
          })
        )}
      </ul>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalCount={data?.totalCount ?? totalCount ?? null}
        onPageChange={(p) => {
          const url = new URLSearchParams(sp.toString());
          url.set("page", String(Math.max(1, p)));
          router.push(`?${url.toString()}`);
        }}
      />

      <p className="text-[11px] text-fg-faint">
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: users table"}
      </p>

      <BulkBar
        connectionId={connectionId}
        table={table}
        visibleColumns={visibleCols}
        hiddenColumns={analysis?.hiddenColumns ?? []}
      />

      <ImportPanel
        open={openImport}
        onClose={() => setOpenImport(false)}
        connectionId={connectionId}
        table={table}
      />
    </div>
  );
}

interface UserRowProps {
  row: Row;
  connectionId: string;
  tableName: string;
  primaryKey: string[];
  tableHref: string;
  cols: {
    name: string | null;
    email: string | null;
    handle: string | null;
    avatar: string | null;
    role: string | null;
    status: string | null;
    lastSeen: string | null;
    created: string | null;
  };
  selectionKey: string | null;
  isSelected: boolean;
  onSelectionToggle?: () => void;
  onView: (pkSegment: string) => void;
}

function UserRow({ row, primaryKey, tableHref, cols, isSelected, onSelectionToggle, onView }: UserRowProps) {
  const name = cols.name ? (row[cols.name] as string | null | undefined) : null;
  const email = cols.email ? (row[cols.email] as string | null | undefined) : null;
  const handle = cols.handle ? (row[cols.handle] as string | null | undefined) : null;
  const avatar = cols.avatar ? (row[cols.avatar] as string | null | undefined) : null;
  const role = cols.role ? row[cols.role] : null;
  const status = cols.status ? (row[cols.status] as string | null | undefined) : null;
  const lastSeenRel = cols.lastSeen ? relativeFromNow(row[cols.lastSeen] as string) : null;
  const createdRel = cols.created ? relativeFromNow(row[cols.created] as string) : null;
  const fallbackId = primaryKey[0] ? row[primaryKey[0]] : null;
  const display = String(name || email || handle || fallbackId || "user");

  const pkSegment = pkFor(row, primaryKey);
  const detailHref = pkSegment ? `${tableHref}/${pkSegment}` : null;

  const Wrapper: React.ElementType = detailHref ? Link : "div";
  const wrapperProps = detailHref
    ? { href: detailHref }
    : { role: "presentation" };

  return (
    <li>
      <div className={cn(
        "group relative flex items-center gap-3 rounded-md border hairline bg-bg-raised p-3 transition-colors hover:border-line-strong hover:bg-bg-raised/80",
        isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
      )}>
        {/* Checkbox column — outside the Link overlay's hit zone (see /speckit-analyze F1). */}
        {onSelectionToggle && (
          <label
            className="pointer-events-auto relative z-20 -m-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-accent"
              checked={isSelected}
              onChange={onSelectionToggle}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${display}`}
            />
          </label>
        )}
        {/* Link overlay covers the card EXCEPT the leftmost ~44px reserved for the checkbox. */}
        <Wrapper
          {...wrapperProps}
          className={cn(
            "absolute right-0 top-0 bottom-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            onSelectionToggle ? "left-11" : "left-0",
          )}
          aria-label={`Open ${display}`}
        />
        <div className="pointer-events-none relative z-10 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-sunken">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-mono text-sm text-fg-muted">
              {avatarFallback(display)}
            </span>
          )}
        </div>
        <div className="pointer-events-none relative z-10 min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{display}</span>
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
            {createdRel && <span className="text-fg-faint">joined {createdRel}</span>}
          </div>
        </div>
        <div className="pointer-events-none relative z-10 flex shrink-0 flex-col items-end gap-1 text-right text-[10px]">
          {role != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-fg-muted">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              {String(role)}
            </span>
          )}
          {lastSeenRel && <span className="text-fg-faint">seen {lastSeenRel}</span>}
        </div>
        <div className="pointer-events-auto relative z-20 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1.5 text-fg-faint opacity-0 transition-opacity hover:bg-bg-sunken hover:text-fg group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Actions for ${display}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {pkSegment && (
                <DropdownMenuItem onClick={() => onView(pkSegment)}>Open</DropdownMenuItem>
              )}
              {pkSegment && (
                <DropdownMenuItem onClick={() => onView(`${pkSegment}?edit=1`)}>
                  Edit
                </DropdownMenuItem>
              )}
              {email && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href={`mailto:${email}`}>Email</a>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
