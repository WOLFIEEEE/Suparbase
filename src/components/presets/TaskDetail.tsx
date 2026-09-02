"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock,
  Kanban,
  Pencil,
  Sparkles,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RowForm } from "@/components/row/RowForm";
import { EditableField } from "@/components/row/EditableField";
import { RowHistoryPanel } from "@/components/row/RowHistoryPanel";
import { RowMoreMenu } from "@/components/row/RowMoreMenu";
import { NotesPanel } from "@/components/workspace/NotesPanel";
import { DeleteRowDialog } from "@/components/row/DeleteRowDialog";
import { StatusPill } from "./shared/StatusPill";
import { useDeleteRow, useInsertRow, useRow } from "@/lib/api/hooks";
import { decodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { cn } from "@/lib/ui/cn";
import type { Column, Schema, Table } from "@/lib/types/schema";
import type { TableAnalysis } from "@/lib/types/analysis";

const META_RE = /^(created_at|updated_at|inserted_at|deleted_at|closed_at|completed_at|started_at)$/i;

const TITLE_PATTERNS = ["title", "name", "subject", "summary"];
const ASSIGNEE_PATTERNS = ["assignee_id", "assigned_to", "assigned_user_id", "owner_id"];
const PRIORITY_PATTERNS = ["priority", "severity"];
const DUE_PATTERNS = ["due_at", "due_date", "deadline", "due"];
const STATUS_PATTERNS = ["status", "state"];
const BODY_PATTERNS = ["description", "body", "details", "notes"];

const STATUS_BUCKET: Record<string, "todo" | "doing" | "done" | "blocked"> = {
  todo: "todo",
  "to do": "todo",
  "to_do": "todo",
  open: "todo",
  new: "todo",
  backlog: "todo",
  "in_progress": "doing",
  "in progress": "doing",
  doing: "doing",
  active: "doing",
  started: "doing",
  review: "doing",
  done: "done",
  closed: "done",
  resolved: "done",
  completed: "done",
  blocked: "blocked",
  cancelled: "blocked",
  canceled: "blocked",
};

const BUCKET_ICON = {
  todo: Circle,
  doing: Clock,
  done: CheckCircle2,
  blocked: X,
} as const;

function find(table: Table, names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

function bucketFor(status: unknown): "todo" | "doing" | "done" | "blocked" | null {
  if (status == null) return null;
  return STATUS_BUCKET[String(status).toLowerCase().trim()] ?? null;
}

interface Props {
  connectionId: string;
  table: Table;
  schema: Schema;
  analysis: TableAnalysis | undefined;
  pkSegment: string;
}

export function TaskDetail({ connectionId, table, schema, analysis, pkSegment }: Props) {
  const workspaceCanEdit = useCurrentConnection().myRole !== "viewer";
  const router = useRouter();
  const sp = useSearchParams();
  const editMode = sp.get("edit") === "1";

  const pkValue = useMemo(() => decodePkSegment(table, pkSegment), [table, pkSegment]);
  const { data: row, isLoading, error } = useRow(connectionId, table, pkValue);
  const deleteRow = useDeleteRow(connectionId, table);
  const insertRow = useInsertRow(connectionId, table);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const primary = analysis?.primary;
  const titleCol = primary?.titleColumn ?? find(table, TITLE_PATTERNS);
  const statusCol = primary?.badgeColumn ?? analysis?.statusColumn ?? find(table, STATUS_PATTERNS);
  const assigneeCol = find(table, ASSIGNEE_PATTERNS);
  const priorityCol = primary?.subtitleColumn ?? find(table, PRIORITY_PATTERNS);
  const dueCol = find(table, DUE_PATTERNS);
  const bodyCol = find(table, BODY_PATTERNS);
  const createdCol = find(table, ["created_at", "inserted_at"]);

  const heroCols = useMemo(
    () =>
      new Set(
        [titleCol, statusCol, assigneeCol, priorityCol, dueCol, bodyCol].filter(Boolean) as string[],
      ),
    [titleCol, statusCol, assigneeCol, priorityCol, dueCol, bodyCol],
  );
  const hidden = useMemo(() => new Set(analysis?.hiddenColumns ?? []), [analysis?.hiddenColumns]);

  const assigneeRelation = useMemo(() => {
    if (!assigneeCol) return null;
    const c = table.columns.find((col) => col.name === assigneeCol);
    return c?.fk ?? null;
  }, [assigneeCol, table.columns]);

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

  const displayName = analysis?.displayName ?? "Tasks";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName, href: tableHref },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={breadcrumbs} title="Task" />
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
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const title = titleCol ? row[titleCol] : null;
  const status = statusCol ? row[statusCol] : null;
  const assignee = assigneeCol ? row[assigneeCol] : null;
  const priority = priorityCol ? row[priorityCol] : null;
  const dueRaw = dueCol ? row[dueCol] : null;
  const dueRel = dueRaw ? relativeFromNow(dueRaw as string) : null;
  const dueDate = dueRaw ? new Date(String(dueRaw)) : null;
  const dueOverdue =
    dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now() && bucketFor(status) !== "done";
  const createdRel = createdCol ? relativeFromNow(row[createdCol] as string) : null;
  const body = bodyCol ? row[bodyCol] : null;
  const fallbackId = table.primaryKey[0] ? row[table.primaryKey[0]] : null;

  const display = title != null ? String(title) : fallbackId != null ? String(fallbackId) : "task";
  const bucket = bucketFor(status);

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
      toast.success(`Removed ${display}`, {
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

  const canEdit = workspaceCanEdit && table.kind === "table" && pkValue !== null;

  const idSet = new Set(table.primaryKey);
  const remaining = table.columns.filter((c) => !heroCols.has(c.name) && !hidden.has(c.name));
  const sections: Array<{ title: string; cols: Column[] }> = [
    { title: "Identifiers", cols: remaining.filter((c) => idSet.has(c.name)) },
    { title: "Details", cols: remaining.filter((c) => !idSet.has(c.name) && !META_RE.test(c.name)) },
    { title: "Timeline", cols: remaining.filter((c) => META_RE.test(c.name) && !idSet.has(c.name)) },
  ].filter((s) => s.cols.length > 0);

  const BucketIcon = bucket ? BUCKET_ICON[bucket] : Kanban;

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
          ) : (
            <>
              <Kanban className="h-3 w-3 text-accent" aria-hidden /> Workflow
            </>
          )
        }
        actions={
          !editMode ? (
            <>
              <RowMoreMenu
                connectionId={connectionId}
                table={table}
                row={row}
                pkSegment={pkSegment}
                canEdit={canEdit}
              />
              {canEdit && (
                <>
              <Button variant="secondary" onClick={() => toggleEdit(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
              </Button>
                </>
              )}
            </>
          ) : null
        }
      />

      {/* Hero: title + status + meta chips */}
      <section className="surface relative overflow-hidden rounded-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-accent/10 to-transparent"
        />
        <div className="relative space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                <BucketIcon className="h-3 w-3" aria-hidden />
                {bucket ?? "task"}
              </div>
              <h2 className="font-display text-2xl leading-tight">{display}</h2>
              {createdRel && <p className="text-xs text-fg-muted">created {createdRel}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              {status != null && <StatusPill value={String(status)} />}
              {priority != null && (
                <span className="inline-flex items-center rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
                  priority · {String(priority)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t hairline pt-4 text-xs">
            {assignee != null && (
              <div className="inline-flex items-center gap-1.5 text-fg-muted">
                <UserIcon className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                <span>assignee · </span>
                {assigneeRelation ? (
                  <Link
                    href={`/c/${connectionId}/tables/${encodeURIComponent(assigneeRelation.table)}`}
                    className="font-medium text-fg hover:text-accent"
                  >
                    {String(assignee).slice(0, 18)}
                  </Link>
                ) : (
                  <code className="font-mono text-fg">{String(assignee).slice(0, 18)}</code>
                )}
              </div>
            )}
            {dueRel && (
              <div
                className={cn(
                  "inline-flex items-center gap-1.5",
                  dueOverdue ? "text-danger" : "text-fg-muted",
                )}
              >
                <Clock className="h-3.5 w-3.5" aria-hidden />
                <span>due {dueRel}{dueOverdue && " · overdue"}</span>
              </div>
            )}
          </div>

          {body != null && String(body).trim().length > 0 && (
            <div className="border-t hairline pt-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                {String(body)}
              </p>
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
                <p className="text-xs text-fg-muted">No other tables reference this task.</p>
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
            <NotesPanel connectionId={connectionId} tableName={table.name} primaryKey={pkValue} />
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


export default TaskDetail;
