"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Clock, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RowForm } from "@/components/row/RowForm";
import { EditableField } from "@/components/row/EditableField";
import { RowHistoryPanel } from "@/components/row/RowHistoryPanel";
import { DeleteRowDialog } from "@/components/row/DeleteRowDialog";
import { StatusPill } from "./shared/StatusPill";
import { useDeleteRow, useInsertRow, useRow } from "@/lib/api/hooks";
import { decodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import type { Column, Schema, Table } from "@/lib/types/schema";
import type { TableAnalysis } from "@/lib/types/analysis";

const TIMESTAMP_PATTERNS = ["created_at", "inserted_at", "occurred_at", "happened_at", "ts", "logged_at"];
const EVENT_PATTERNS = ["event", "event_type", "action", "verb", "operation", "kind", "type"];
const PAYLOAD_PATTERNS = ["payload", "data", "metadata", "details", "body"];
const ACTOR_PATTERNS = ["user_id", "actor_id", "owner_id", "principal_id", "by_user_id"];

function find(table: Table, names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

interface Props {
  connectionId: string;
  table: Table;
  schema: Schema;
  analysis: TableAnalysis | undefined;
  pkSegment: string;
}

export function LogDetail({ connectionId, table, schema, analysis, pkSegment }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const editMode = sp.get("edit") === "1";

  const pkValue = useMemo(() => decodePkSegment(table, pkSegment), [table, pkSegment]);
  const { data: row, isLoading, error } = useRow(connectionId, table, pkValue);
  const deleteRow = useDeleteRow(connectionId, table);
  const insertRow = useInsertRow(connectionId, table);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tsCol = find(table, TIMESTAMP_PATTERNS);
  const eventCol = analysis?.primary?.titleColumn ?? analysis?.statusColumn ?? find(table, EVENT_PATTERNS);
  const payloadCol = find(table, PAYLOAD_PATTERNS);
  const actorCol = find(table, ACTOR_PATTERNS);

  const heroCols = useMemo(
    () => new Set([tsCol, eventCol, payloadCol, actorCol].filter(Boolean) as string[]),
    [tsCol, eventCol, payloadCol, actorCol],
  );
  const hidden = useMemo(() => new Set(analysis?.hiddenColumns ?? []), [analysis?.hiddenColumns]);

  const actorRelation = useMemo(() => {
    if (!actorCol) return null;
    const c = table.columns.find((col) => col.name === actorCol);
    return c?.fk ?? null;
  }, [actorCol, table.columns]);

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

  const displayName = analysis?.displayName ?? "Activity";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName, href: tableHref },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={breadcrumbs} title="Event" />
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

  if (isLoading || !row) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={breadcrumbs} title="…" />
        <div className="surface space-y-3 rounded-md p-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const fallbackId = table.primaryKey[0] ? row[table.primaryKey[0]] : null;
  const event = eventCol && row[eventCol] != null ? String(row[eventCol]) : null;
  const actor = actorCol && row[actorCol] != null ? String(row[actorCol]) : null;
  const tsValue = tsCol ? row[tsCol] : null;
  const tsDate = tsValue ? new Date(String(tsValue)) : null;
  const tsAbs = tsDate && !Number.isNaN(tsDate.getTime()) ? tsDate.toLocaleString() : null;
  const tsRel = tsDate ? relativeFromNow(tsDate) : null;
  const payload = payloadCol ? row[payloadCol] : null;

  const display = event ?? (fallbackId != null ? String(fallbackId) : "event");

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
      toast.success(`Removed from ${table.name}`, {
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

  const idSet = new Set(table.primaryKey);
  const remaining = table.columns.filter(
    (c) => !heroCols.has(c.name) && !hidden.has(c.name),
  );
  const sections: Array<{ title: string; cols: Column[] }> = [
    { title: "Identifiers", cols: remaining.filter((c) => idSet.has(c.name)) },
    { title: "Fields", cols: remaining.filter((c) => !idSet.has(c.name)) },
  ].filter((s) => s.cols.length > 0);

  const prettyPayload = (() => {
    if (payload == null) return null;
    if (typeof payload === "string") {
      try {
        return JSON.stringify(JSON.parse(payload), null, 2);
      } catch {
        return payload;
      }
    }
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[...breadcrumbs, { label: display }]}
        title={display}
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden />
              AI · {analysis.category}
            </>
          ) : null
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

      <section className="surface rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
              <Clock className="h-3 w-3" aria-hidden />
              {tsRel ?? "no timestamp"}
            </div>
            <h2 className="font-display text-2xl leading-tight">
              {tsAbs ?? (fallbackId != null ? String(fallbackId) : "event")}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {event != null && <StatusPill value={event} />}
            {actorRelation && actor && (
              <Link
                href={`/c/${connectionId}/tables/${encodeURIComponent(actorRelation.table)}`}
                className="inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-[11px] text-fg-muted hover:text-fg"
              >
                actor · {String(actor).slice(0, 14)}
              </Link>
            )}
          </div>
        </div>
        {prettyPayload && (
          <pre className="mt-4 max-h-[28rem] overflow-auto rounded surface-sunken p-3 font-mono text-[12px] leading-relaxed">
            {prettyPayload}
          </pre>
        )}
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
                    <EditableField key={col.name} col={col} value={row[col.name]} connectionId={connectionId} table={table} pk={pkValue} />
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
                      <EditableField key={col.name} col={col} value={row[col.name]} connectionId={connectionId} table={table} pk={pkValue} />
                    ))}
                </dl>
              </details>
            )}
          </div>
          <aside className="space-y-4">
            <section className="surface rounded-md p-5">
              <h3 className="mb-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                Linked records
              </h3>
              {incomingRefs.length === 0 ? (
                <p className="text-xs text-fg-muted">No other tables reference this.</p>
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
                          <ArrowUpRight
                            className="h-3.5 w-3.5 shrink-0 text-fg-faint transition-colors group-hover:text-accent"
                            aria-hidden
                          />
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
            <RowHistoryPanel connectionId={connectionId} table={table} pk={pkValue} />
            </aside>
        </div>
      )}

      <DeleteRowDialog
        open={confirmDelete}
        tableName={table.name}
        rowLabel={display}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={performDelete}
        pending={deleteRow.isPending}
      />
    </div>
  );
}


export default LogDetail;
