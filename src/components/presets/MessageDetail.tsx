"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CornerDownRight,
  MessageSquare,
  Pencil,
  Sparkles,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RowForm } from "@/components/row/RowForm";
import { EditableField } from "@/components/row/EditableField";
import { DeleteRowDialog } from "@/components/row/DeleteRowDialog";
import { useDeleteRow, useInsertRow, useRow } from "@/lib/api/hooks";
import { decodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import type { Column, Schema, Table } from "@/lib/types/schema";
import type { TableAnalysis } from "@/lib/types/analysis";

const META_RE = /^(created_at|updated_at|inserted_at|deleted_at|posted_at|sent_at|edited_at)$/i;

const BODY_PATTERNS = ["body", "content", "text", "message", "comment"];
const AUTHOR_PATTERNS = ["author_id", "user_id", "sender_id", "by_user_id", "posted_by", "created_by"];
const THREAD_PATTERNS = ["parent_id", "thread_id", "conversation_id", "reply_to", "in_reply_to"];

function find(table: Table, names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

function snippet(value: unknown, max = 80): string {
  if (value == null) return "";
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

interface Props {
  connectionId: string;
  table: Table;
  schema: Schema;
  analysis: TableAnalysis | undefined;
  pkSegment: string;
}

export function MessageDetail({ connectionId, table, schema, analysis, pkSegment }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const editMode = sp.get("edit") === "1";

  const pkValue = useMemo(() => decodePkSegment(table, pkSegment), [table, pkSegment]);
  const { data: row, isLoading, error } = useRow(connectionId, table, pkValue);
  const deleteRow = useDeleteRow(connectionId, table);
  const insertRow = useInsertRow(connectionId, table);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const primary = analysis?.primary;
  const bodyCol = primary?.subtitleColumn ?? find(table, BODY_PATTERNS);
  const authorCol = primary?.titleColumn ?? find(table, AUTHOR_PATTERNS);
  const threadCol = find(table, THREAD_PATTERNS);
  const createdCol = find(table, ["created_at", "inserted_at", "posted_at", "sent_at"]);

  const heroCols = useMemo(
    () =>
      new Set(
        [bodyCol, authorCol, threadCol, createdCol].filter(Boolean) as string[],
      ),
    [bodyCol, authorCol, threadCol, createdCol],
  );
  const hidden = useMemo(() => new Set(analysis?.hiddenColumns ?? []), [analysis?.hiddenColumns]);

  const authorRelation = useMemo(() => {
    if (!authorCol) return null;
    const c = table.columns.find((col) => col.name === authorCol);
    return c?.fk ?? null;
  }, [authorCol, table.columns]);

  const threadRelation = useMemo(() => {
    if (!threadCol) return null;
    const c = table.columns.find((col) => col.name === threadCol);
    // Self-FK (replies inside the same table) is common.
    return c?.fk ?? null;
  }, [threadCol, table.columns]);

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

  const displayName = analysis?.displayName ?? "Conversations";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName, href: tableHref },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={breadcrumbs} title="Message" />
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

  const author = authorCol ? row[authorCol] : null;
  const body = bodyCol ? row[bodyCol] : null;
  const thread = threadCol ? row[threadCol] : null;
  const createdRaw = createdCol ? row[createdCol] : null;
  const createdRel = createdRaw ? relativeFromNow(createdRaw as string) : null;
  const createdDate = createdRaw ? new Date(String(createdRaw)) : null;
  const createdAbs =
    createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.toLocaleString() : null;

  const isReply = thread != null;
  const fallbackId = table.primaryKey[0] ? row[table.primaryKey[0]] : null;
  const authorLabel = author != null ? String(author).slice(0, 18) : null;
  const titleForCrumb = snippet(body, 60) || authorLabel || (fallbackId != null ? String(fallbackId) : "message");

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
      toast.success(`Removed message`, {
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
  const remaining = table.columns.filter((c) => !heroCols.has(c.name) && !hidden.has(c.name));
  const sections: Array<{ title: string; cols: Column[] }> = [
    { title: "Identifiers", cols: remaining.filter((c) => idSet.has(c.name)) },
    { title: "Fields", cols: remaining.filter((c) => !idSet.has(c.name) && !META_RE.test(c.name)) },
    { title: "Timeline", cols: remaining.filter((c) => META_RE.test(c.name) && !idSet.has(c.name)) },
  ].filter((s) => s.cols.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[...breadcrumbs, { label: titleForCrumb }]}
        title={authorLabel ?? (fallbackId != null ? String(fallbackId) : "Message")}
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden />
              AI · {analysis.category}
            </>
          ) : (
            <>
              <MessageSquare className="h-3 w-3 text-accent" aria-hidden /> Conversation
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

      {/* Hero: chat bubble */}
      <section className="surface rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-sunken">
            {isReply ? (
              <CornerDownRight className="h-4 w-4 text-fg-muted" aria-hidden />
            ) : (
              <UserIcon className="h-4 w-4 text-fg-muted" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {authorLabel != null && (
                <span className="font-medium text-fg">
                  {authorRelation ? (
                    <Link
                      href={`/c/${connectionId}/tables/${encodeURIComponent(authorRelation.table)}`}
                      className="hover:text-accent"
                    >
                      {authorLabel}
                    </Link>
                  ) : (
                    authorLabel
                  )}
                </span>
              )}
              {createdRel && (
                <span className="text-fg-faint" title={createdAbs ?? undefined}>
                  {createdRel}
                </span>
              )}
              {isReply && (
                <span className="inline-flex items-center rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
                  reply
                </span>
              )}
            </div>
            <div className="rounded-md bg-bg-sunken px-4 py-3">
              {body != null && String(body).trim().length > 0 ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{String(body)}</p>
              ) : (
                <p className="text-sm italic text-fg-faint">No body.</p>
              )}
            </div>
            {isReply && threadRelation && (
              <Link
                href={`/c/${connectionId}/tables/${encodeURIComponent(threadRelation.table)}`}
                className="inline-flex items-center gap-1 text-[11px] text-fg-faint hover:text-accent"
              >
                <CornerDownRight className="h-3 w-3" aria-hidden /> in reply to{" "}
                <code className="font-mono text-fg-muted">{String(thread).slice(0, 12)}</code>
              </Link>
            )}
          </div>
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
        rowLabel={titleForCrumb}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={performDelete}
        pending={deleteRow.isPending}
      />
    </div>
  );
}


export default MessageDetail;
