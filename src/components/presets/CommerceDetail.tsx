"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Hash,
  KeyRound,
  Pencil,
  ShoppingCart,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RowForm } from "@/components/row/RowForm";
import { DeleteRowDialog } from "@/components/row/DeleteRowDialog";
import { StatusPill } from "./shared/StatusPill";
import { useDeleteRow, useInsertRow, useRow } from "@/lib/api/hooks";
import { decodePkSegment } from "@/lib/table/pk";
import { formatCellValue } from "@/lib/table/cellFormat";
import { relativeFromNow } from "@/lib/ui/time";
import {
  COMMERCE_STEP_LABELS,
  COMMERCE_TERMINAL_STATES,
  formatMoney,
  isCentsColumnName,
  isMoneyColumnName,
  pipelineStepFor,
} from "@/lib/ui/money";
import { cn } from "@/lib/ui/cn";
import { AppError } from "@/lib/errors";
import type { Column, Schema, Table } from "@/lib/types/schema";
import type { TableAnalysis } from "@/lib/types/analysis";

const META_RE = /^(created_at|updated_at|inserted_at|deleted_at|placed_at|ordered_at|paid_at|shipped_at|delivered_at)$/i;

interface Props {
  connectionId: string;
  table: Table;
  schema: Schema;
  analysis: TableAnalysis | undefined;
  pkSegment: string;
}

function findColumn(table: Table, names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

export function CommerceDetail({ connectionId, table, schema, analysis, pkSegment }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const editMode = sp.get("edit") === "1";

  const pkValue = useMemo(() => decodePkSegment(table, pkSegment), [table, pkSegment]);
  const { data: row, isLoading, error } = useRow(connectionId, table, pkValue);
  const deleteRow = useDeleteRow(connectionId, table);
  const insertRow = useInsertRow(connectionId, table);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const orderNumberCol =
    analysis?.primary?.titleColumn ??
    findColumn(table, ["order_number", "order_no", "invoice_number", "invoice_no", "reference", "ref"]);
  const customerCol = analysis?.primary?.subtitleColumn ?? findColumn(table, ["customer_id", "buyer_id", "payer_id"]);
  const statusCol = analysis?.primary?.badgeColumn ?? analysis?.statusColumn ?? findColumn(table, ["status", "state"]);
  const currencyCol = findColumn(table, ["currency", "currency_code"]);
  // Pick the headline money column.
  const totalCol = useMemo(() => {
    const preferred = ["total", "total_amount", "grand_total", "amount", "amount_cents"];
    for (const p of preferred) {
      const m = table.columns.find((c) => c.name.toLowerCase() === p);
      if (m) return m.name;
    }
    return table.columns.find((c) => isMoneyColumnName(c.name))?.name ?? null;
  }, [table.columns]);

  // Every money column on this table (for formatting in the body sections).
  const moneyCols = useMemo(() => {
    return new Set(table.columns.filter((c) => isMoneyColumnName(c.name)).map((c) => c.name));
  }, [table.columns]);

  const heroCols = useMemo(
    () =>
      new Set(
        [orderNumberCol, customerCol, statusCol, totalCol, currencyCol].filter(Boolean) as string[],
      ),
    [orderNumberCol, customerCol, statusCol, totalCol, currencyCol],
  );
  const hidden = useMemo(() => new Set(analysis?.hiddenColumns ?? []), [analysis?.hiddenColumns]);

  const incomingRefs = useMemo(() => {
    const out: Array<{ table: Table; fkColumn: string }> = [];
    for (const t of schema.tables) {
      if (t.schema === table.schema && t.name === table.name) continue;
      for (const c of t.columns) {
        if (c.fk && c.fk.schema === table.schema && c.fk.table === table.name) {
          out.push({ table: t, fkColumn: c.name });
        }
      }
    }
    return out;
  }, [schema, table.name, table.schema]);

  const displayName = analysis?.displayName ?? "Orders";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName, href: tableHref },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={breadcrumbs} title="Order" />
        <ErrorBanner
          error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))}
        />
      </div>
    );
  }

  if (isLoading || !row) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={breadcrumbs} title="…" />
        <div className="surface space-y-3 rounded-md p-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
    );
  }

  const orderNumber = orderNumberCol ? row[orderNumberCol] : null;
  const customer = customerCol ? row[customerCol] : null;
  const status = statusCol ? row[statusCol] : null;
  const totalRaw = totalCol ? row[totalCol] : null;
  const currency = currencyCol ? (row[currencyCol] as string | null) : null;
  const totalIsCents = totalCol ? isCentsColumnName(totalCol) : false;
  const totalFormatted = totalCol ? formatMoney(totalRaw, currency, totalIsCents) : null;

  const orderLabel = orderNumber != null ? `#${String(orderNumber)}` : table.primaryKey[0] ? `#${String(row[table.primaryKey[0]] ?? "")}` : "Order";

  const placedRel = (() => {
    const placedCol =
      findColumn(table, ["placed_at", "ordered_at", "created_at", "inserted_at"]);
    return placedCol ? relativeFromNow(row[placedCol] as string) : null;
  })();

  // Identity sections
  const idSet = new Set(table.primaryKey);
  const remaining = table.columns.filter(
    (c) => !heroCols.has(c.name) && !hidden.has(c.name),
  );
  const sections: Array<{ title: string; cols: Column[] }> = [
    { title: "Identifiers", cols: remaining.filter((c) => idSet.has(c.name)) },
    { title: "Details", cols: remaining.filter((c) => !idSet.has(c.name) && !META_RE.test(c.name)) },
    { title: "Timeline", cols: remaining.filter((c) => META_RE.test(c.name) && !idSet.has(c.name)) },
  ].filter((s) => s.cols.length > 0);

  const statusStr = status != null ? String(status) : null;
  const statusLower = statusStr?.toLowerCase() ?? "";
  const isTerminal = COMMERCE_TERMINAL_STATES.has(statusLower);
  const pipelineStep = pipelineStepFor(statusStr);

  function toggleEdit(edit: boolean) {
    const next = new URLSearchParams(sp.toString());
    if (edit) next.set("edit", "1");
    else next.delete("edit");
    router.replace(`?${next.toString()}`);
  }

  async function performDelete() {
    if (!pkValue || !row) return;
    const snapshot = row;
    try {
      await deleteRow.mutateAsync(pkValue);
      setConfirmDelete(false);
      toast.success(`Deleted ${orderLabel}`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await insertRow.mutateAsync(snapshot);
              toast.success("Restored");
            } catch (e) {
              const app = e instanceof AppError ? e : new AppError("client_bug", String((e as Error).message ?? e));
              toast.error(`Could not restore: ${app.message}`);
            }
          },
        },
      });
      router.push(tableHref);
    } catch (e) {
      const app = e instanceof AppError ? e : new AppError("client_bug", String((e as Error).message ?? e));
      toast.error(`Delete failed: ${app.message}`);
      setConfirmDelete(false);
    }
  }

  const canEdit = table.kind === "table" && pkValue !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[...breadcrumbs, { label: orderLabel }]}
        title={orderLabel}
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden />
              AI · {analysis.category}
            </>
          ) : (
            <>
              <ShoppingCart className="h-3 w-3 text-accent" aria-hidden /> Commerce
            </>
          )
        }
        actions={
          canEdit && !editMode ? (
            <>
              <Button variant="secondary" onClick={() => toggleEdit(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
              </Button>
            </>
          ) : null
        }
      />

      {/* Hero: order number + total at display size + status */}
      <section className="surface relative overflow-hidden rounded-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/10 to-transparent"
        />
        <div className="relative space-y-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                <Hash className="h-3 w-3" aria-hidden /> order
              </div>
              <h2 className="font-display text-3xl leading-tight">{orderLabel}</h2>
              {placedRel && (
                <p className="text-xs text-fg-muted">placed {placedRel}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {totalFormatted && (
                <div className="font-display text-4xl tabular-nums leading-none">
                  {totalFormatted}
                </div>
              )}
              {statusStr && <StatusPill value={statusStr} />}
            </div>
          </div>

          {/* Pipeline */}
          {pipelineStep >= 0 && !isTerminal && (
            <div className="space-y-2 border-t hairline pt-4">
              <div className="grid grid-cols-4 gap-2">
                {COMMERCE_STEP_LABELS.map((label, i) => {
                  const done = i <= pipelineStep;
                  const current = i === pipelineStep;
                  return (
                    <div key={label} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-medium",
                            done
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-line text-fg-faint",
                            current && "ring-2 ring-accent/40",
                          )}
                        >
                          {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] uppercase tracking-wider",
                            done ? "text-fg" : "text-fg-faint",
                          )}
                        >
                          {label}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "h-0.5 w-full rounded-full transition-colors",
                          done ? "bg-accent/60" : "bg-line",
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isTerminal && (
            <div className="border-t hairline pt-4 text-xs text-fg-muted">
              This order is in a terminal state ({statusStr}). No further pipeline steps.
            </div>
          )}

          {table.primaryKey.length > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-fg-faint">
              <KeyRound className="h-3 w-3 text-accent" aria-hidden />
              {table.primaryKey.map((c, i) => (
                <span key={c}>
                  <code className="font-mono text-fg-muted">{c}</code>={" "}
                  <code className="font-mono text-fg">{String(row[c] ?? "")}</code>
                  {i < table.primaryKey.length - 1 && ", "}
                </span>
              ))}
              {customer != null && (
                <>
                  <span className="mx-1">·</span>
                  <span>customer · <code className="font-mono text-fg">{String(customer).slice(0, 18)}</code></span>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {editMode && canEdit ? (
        <section className="surface rounded-md p-6">
          <RowForm
            table={table}
            schema={schema}
            mode="edit"
            initialRow={row}
            onCancel={() => toggleEdit(false)}
            onSaved={() => toggleEdit(false)}
          />
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-6">
            {sections.map((s) => (
              <section key={s.title} className="surface space-y-3 rounded-md p-6">
                <h3 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{s.title}</h3>
                <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-[10rem_1fr]">
                  {s.cols.map((col) => (
                    <FieldRow
                      key={col.name}
                      col={col}
                      value={row[col.name]}
                      isMoney={moneyCols.has(col.name)}
                      currency={currency}
                    />
                  ))}
                </dl>
              </section>
            ))}
            {hidden.size > 0 && (
              <details className="surface rounded-md p-6 text-xs text-fg-muted">
                <summary className="cursor-pointer text-fg-faint hover:text-fg">
                  {hidden.size} hidden internal {hidden.size === 1 ? "field" : "fields"}
                </summary>
                <dl className="mt-4 grid grid-cols-1 gap-y-2 sm:grid-cols-[10rem_1fr]">
                  {table.columns
                    .filter((c) => hidden.has(c.name))
                    .map((col) => (
                      <FieldRow
                        key={col.name}
                        col={col}
                        value={row[col.name]}
                        isMoney={moneyCols.has(col.name)}
                        currency={currency}
                      />
                    ))}
                </dl>
              </details>
            )}
          </div>
          <aside className="space-y-4">
            <section className="surface rounded-md p-5">
              <h3 className="mb-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                Line items + linked records
              </h3>
              {incomingRefs.length === 0 ? (
                <p className="text-xs text-fg-muted">No other tables reference this order.</p>
              ) : (
                <ul className="space-y-1.5">
                  {incomingRefs.map(({ table: t, fkColumn }) => {
                    const href = `/c/${connectionId}/tables/${encodeURIComponent(t.name)}`;
                    return (
                      <li key={`${t.schema}.${t.name}.${fkColumn}`}>
                        <Link
                          href={href}
                          className="group flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-bg-sunken"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-fg">{t.name}</span>
                            <span className="block truncate font-mono text-[10px] text-fg-faint">
                              via {fkColumn}
                            </span>
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-fg-faint transition-colors group-hover:text-accent" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {analysis?.notes && (
              <section className="surface rounded-md p-5 text-xs text-fg-muted">
                <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  AI notes
                </h3>
                <p className="leading-relaxed">{analysis.notes}</p>
              </section>
            )}
          </aside>
        </div>
      )}

      <DeleteRowDialog
        open={confirmDelete}
        tableName={table.name}
        rowLabel={orderLabel}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={performDelete}
        pending={deleteRow.isPending}
      />
    </div>
  );
}

function FieldRow({
  col,
  value,
  isMoney,
  currency,
}: {
  col: Column;
  value: unknown;
  isMoney: boolean;
  currency: string | null;
}) {
  const formatted = formatCellValue(col, value);
  const renderMoney = isMoney && value != null;
  return (
    <div className="contents">
      <dt className="font-mono text-xs text-fg-muted">{col.name}</dt>
      <dd className={cn("min-w-0 font-mono text-xs", formatted.isNull && "italic text-fg-faint")}>
        {renderMoney ? (
          <span className="font-display text-sm tabular-nums">
            {formatMoney(value, currency, isCentsColumnName(col.name))}
          </span>
        ) : col.category === "json" && value != null ? (
          <pre className="max-h-64 overflow-auto rounded surface-sunken p-2 text-[11px] leading-relaxed">
            {(() => {
              try {
                const parsed = typeof value === "string" ? JSON.parse(value) : value;
                return JSON.stringify(parsed, null, 2);
              } catch {
                return String(value);
              }
            })()}
          </pre>
        ) : col.category === "boolean" && value != null ? (
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
              value ? "bg-accent/10 text-accent" : "bg-line/40 text-fg-muted",
            )}
          >
            {String(value)}
          </span>
        ) : (
          <span className="whitespace-pre-wrap break-words">{formatted.text}</span>
        )}
      </dd>
    </div>
  );
}

export default CommerceDetail;
