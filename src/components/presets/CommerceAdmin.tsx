"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Hash,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRows, useRowCount } from "@/lib/api/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ListParams } from "@/lib/pgrest/rows";
import type { Row } from "@/lib/types/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PaginationBar } from "@/components/data/PaginationBar";
import { PageHeader, StatTile } from "@/components/workspace/PageHeader";
import { PresetSwitcher } from "@/components/workspace/PresetSwitcher";
import { SelectionProvider, useSelection } from "@/components/data/SelectionContext";
import { BulkBar } from "@/components/data/BulkBar";
import { ExportMenu } from "@/components/data/ExportMenu";
import { ImportPanel } from "@/components/data/ImportPanel";
import { FilterBar } from "@/components/data/FilterBar";
import { ViewTabs } from "@/components/data/ViewTabs";
import { parseFilterParams } from "@/lib/filters/parse-url";
import { StatusPill } from "./shared/StatusPill";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import { encodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import { formatMoney, isCentsColumnName, isMoneyColumnName } from "@/lib/ui/money";
import type { PresetProps } from "./types";

const ORDER_NUMBER_PATTERNS = [
  "order_number",
  "order_no",
  "invoice_number",
  "invoice_no",
  "receipt_number",
  "reference",
  "ref",
];
const CUSTOMER_FK_PATTERNS = ["customer_id", "buyer_id", "payer_id", "account_id"];
const STATUS_PATTERNS = ["status", "state"];
const CURRENCY_PATTERNS = ["currency", "currency_code"];
const CREATED_PATTERNS = ["created_at", "placed_at", "ordered_at", "inserted_at"];

function findColumn(table: PresetProps["table"], names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
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

export default function CommerceAdmin(props: PresetProps) {
  return (
    <SelectionProvider>
      <CommerceAdminBody {...props} />
    </SelectionProvider>
  );
}

function CommerceAdminBody({ connectionId, table, analysis }: PresetProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();

  const primary = analysis?.primary;
  const orderNumberCol =
    primary?.titleColumn ?? findColumn(table, ORDER_NUMBER_PATTERNS) ?? table.primaryKey[0] ?? null;
  const customerCol =
    primary?.subtitleColumn ?? findColumn(table, CUSTOMER_FK_PATTERNS);
  const statusCol =
    primary?.badgeColumn ?? analysis?.statusColumn ?? findColumn(table, STATUS_PATTERNS);
  const currencyCol = findColumn(table, CURRENCY_PATTERNS);
  const createdCol = findColumn(table, CREATED_PATTERNS);

  // Pick the most representative money column for the row card: prefer `total`,
  // then `amount`, then anything else money-shaped.
  const moneyCol = useMemo(() => {
    const preferred = ["total", "total_amount", "grand_total", "amount", "amount_cents"];
    for (const p of preferred) {
      const m = table.columns.find((c) => c.name.toLowerCase() === p);
      if (m) return m.name;
    }
    const any = table.columns.find((c) => isMoneyColumnName(c.name));
    return any?.name ?? null;
  }, [table.columns]);

  const [searchInput, setSearchInput] = useState(sp.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const filters = useMemo(() => parseFilterParams(sp), [sp]);

  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const pageSize = 25 as const;
  const listParams: ListParams = useMemo(
    () => ({
      page,
      pageSize,
      sort: createdCol ? { column: createdCol, direction: "desc" } : undefined,
      search: debouncedSearch || undefined,
      filters,
    }),
    [page, debouncedSearch, createdCol, filters],
  );

  const { data, isLoading, isFetching, error } = useRows(connectionId, table, listParams);
  const { data: totalCountResult } = useRowCount(connectionId, table);
  const totalCount = totalCountResult?.count ?? null;
  const rows = data?.rows ?? [];

  const selection = useSelection();
  const pageKeys = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      const seg = pkFor(r, table.primaryKey);
      if (seg) out.push(seg);
    }
    return out;
  }, [rows, table.primaryKey]);
  const allPageSelected =
    pageKeys.length > 0 && pageKeys.every((k) => selection.isSelected(k));

  // On-page revenue tally (when moneyCol is present).
  const pageRevenue = useMemo(() => {
    if (!moneyCol) return null;
    let sum = 0;
    let currency = "USD";
    const isCents = isCentsColumnName(moneyCol);
    for (const r of rows) {
      const raw = r[moneyCol];
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n)) sum += isCents ? n / 100 : n;
      if (currencyCol && typeof r[currencyCol] === "string") {
        currency = String(r[currencyCol]);
      }
    }
    return { sum, currency };
  }, [rows, moneyCol, currencyCol]);

  const displayName = analysis?.displayName ?? "Orders";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName },
  ];

  const visibleCols = (analysis?.listColumns?.length
    ? analysis.listColumns
    : table.columns.map((c) => c.name)
  ).filter((c) => !(analysis?.hiddenColumns ?? []).includes(c));

  const [openImport, setOpenImport] = useState(false);

  const headerActions = (
    <>
      <PresetSwitcher active="commerce" />
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
            New order
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

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={displayName}
        subtitle={
          <span className="inline-flex items-center gap-2 font-mono text-xs">
            {table.schema}.{table.name}
          </span>
        }
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI · {analysis.category}
            </>
          ) : (
            <>
              <ShoppingCart className="h-3 w-3 text-accent" aria-hidden /> Commerce
            </>
          )
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
          label="Total orders"
          value={totalCount != null ? totalCount.toLocaleString() : "—"}
          hint={createdCol ? "newest first" : undefined}
        />
        <StatTile
          label="On this page"
          value={rows.length}
          hint={`page ${page}`}
        />
        <StatTile
          label="Revenue (page)"
          value={pageRevenue ? formatMoney(pageRevenue.sum * (isCentsColumnName(moneyCol ?? "") ? 100 : 1), pageRevenue.currency, isCentsColumnName(moneyCol ?? "")) : "—"}
          hint={moneyCol ? `column: ${moneyCol}` : "no money column"}
        />
        <StatTile
          label="Columns"
          value={table.columns.length}
          hint={`${analysis?.hiddenColumns?.length ?? 0} hidden`}
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
            placeholder="Search by order number, customer…"
            className="pl-9 pr-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={`Search ${table.name}`}
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
      </div>

      <FilterBar table={table} />

      <ul className="grid grid-cols-1 gap-2">
        {isLoading && rows.length === 0 ? (
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-[68px] w-full rounded-md" />
            </li>
          ))
        ) : rows.length === 0 ? (
          <li className="surface rounded-md px-6 py-16 text-center text-sm text-fg-muted">
            {debouncedSearch ? (
              <>No orders match <span className="font-mono">{debouncedSearch}</span>.</>
            ) : (
              <>No orders yet.</>
            )}
          </li>
        ) : (
          rows.map((row, idx) => {
            const pkSegment = pkFor(row, table.primaryKey);
            return (
              <OrderRow
                key={`o-${idx}`}
                row={row}
                connectionId={connectionId}
                tableName={table.name}
                primaryKey={table.primaryKey}
                cols={{
                  orderNumber: orderNumberCol,
                  customer: customerCol,
                  status: statusCol,
                  money: moneyCol,
                  currency: currencyCol,
                  created: createdCol,
                }}
                selectionKey={pkSegment}
                isSelected={pkSegment ? selection.isSelected(pkSegment) : false}
                onSelectionToggle={pkSegment ? () => selection.toggle(pkSegment) : undefined}
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
        {analysis?.notes ? `AI: ${analysis.notes}` : "Heuristic: commerce table"}
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

interface OrderRowProps {
  row: Row;
  connectionId: string;
  tableName: string;
  primaryKey: string[];
  cols: {
    orderNumber: string | null;
    customer: string | null;
    status: string | null;
    money: string | null;
    currency: string | null;
    created: string | null;
  };
  selectionKey: string | null;
  isSelected: boolean;
  onSelectionToggle?: () => void;
}

function OrderRow({ row, connectionId, tableName, primaryKey, cols, isSelected, onSelectionToggle }: OrderRowProps) {
  const orderNumber = cols.orderNumber ? row[cols.orderNumber] : null;
  const customer = cols.customer ? row[cols.customer] : null;
  const status = cols.status ? row[cols.status] : null;
  const moneyRaw = cols.money ? row[cols.money] : null;
  const currency = cols.currency ? (row[cols.currency] as string | null) : null;
  const createdRel = cols.created ? relativeFromNow(row[cols.created] as string) : null;

  const isCents = cols.money ? isCentsColumnName(cols.money) : false;
  const formattedMoney = cols.money ? formatMoney(moneyRaw, currency, isCents) : null;
  const orderLabel = orderNumber != null ? `#${String(orderNumber)}` : (primaryKey[0] ? `#${String(row[primaryKey[0]] ?? "")}` : "order");

  const pkSegment = (() => {
    if (primaryKey.length === 0) return null;
    const pk: Record<string, unknown> = {};
    for (const col of primaryKey) {
      if (row[col] == null) return null;
      pk[col] = row[col];
    }
    return encodePkSegment(pk);
  })();
  const detailHref = pkSegment
    ? `/c/${connectionId}/tables/${encodeURIComponent(tableName)}/${pkSegment}`
    : null;

  return (
    <li>
      <div className={cn(
        "group relative flex items-center gap-3 rounded-md border hairline bg-bg-raised p-3 transition-colors hover:border-line-strong hover:bg-bg-raised/80",
        isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
      )}>
        {onSelectionToggle && (
          <label
            className="relative z-20 -m-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-accent"
              checked={isSelected}
              onChange={onSelectionToggle}
              aria-label={`Select ${orderLabel}`}
            />
          </label>
        )}
        {detailHref && (
          <Link
            href={detailHref}
            className={cn(
              "absolute right-0 top-0 bottom-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              onSelectionToggle ? "left-11" : "left-0",
            )}
            aria-label={`Open ${orderLabel}`}
          />
        )}
        <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-sunken">
          <ShoppingCart className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
        </div>
        <div className="relative z-10 min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 truncate text-sm font-medium">
              <Hash className="h-3 w-3 text-fg-faint" aria-hidden />
              {String(orderNumber ?? (primaryKey[0] ? row[primaryKey[0]] : "—"))}
            </span>
            {status != null && <StatusPill value={String(status)} />}
          </div>
          <div className="flex items-center gap-3 truncate text-xs text-fg-muted">
            {customer != null && (
              <span className="truncate">customer · {String(customer).slice(0, 18)}</span>
            )}
            {createdRel && <span className="text-fg-faint">placed {createdRel}</span>}
          </div>
        </div>
        <div className="relative z-10 shrink-0 text-right">
          {formattedMoney && (
            <div className="font-display text-base tabular-nums">{formattedMoney}</div>
          )}
        </div>
        <div className="relative z-20 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1.5 text-fg-faint opacity-0 transition-opacity hover:bg-bg-sunken hover:text-fg group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`Actions for ${orderLabel}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {detailHref && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={detailHref}>Open</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`${detailHref}?edit=1`}>Edit</Link>
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
