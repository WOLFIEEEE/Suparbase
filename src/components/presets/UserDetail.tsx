"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Mail,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RowForm } from "@/components/row/RowForm";
import { EditableField } from "@/components/row/EditableField";
import { DeleteRowDialog } from "@/components/row/DeleteRowDialog";
import { StatusPill } from "./shared/StatusPill";
import { useDeleteRow, useInsertRow, useRow } from "@/lib/api/hooks";
import { decodePkSegment } from "@/lib/table/pk";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import type { Column, Schema, Table } from "@/lib/types/schema";
import type { TableAnalysis } from "@/lib/types/analysis";

const EMAIL_PATTERNS = ["email", "primary_email"];
const NAME_PATTERNS = ["display_name", "full_name", "name"];
const HANDLE_PATTERNS = ["username", "handle", "login"];
const AVATAR_PATTERNS = ["avatar_url", "avatar", "image", "photo_url", "picture"];
const ROLE_PATTERNS = ["role", "kind", "type", "tier"];
const STATUS_PATTERNS = ["status", "state"];
const LAST_SEEN_PATTERNS = ["last_sign_in_at", "last_seen_at", "last_login_at"];
const CREATED_PATTERNS = ["created_at", "inserted_at", "registered_at"];
const META_RE = /^(created_at|updated_at|inserted_at|deleted_at|last_sign_in_at|last_seen_at|last_login_at|registered_at)$/i;

function findColumn(table: Table, names: readonly string[]): string | null {
  for (const n of names) {
    const c = table.columns.find((col) => col.name.toLowerCase() === n);
    if (c) return c.name;
  }
  return null;
}

function initials(label: string | null | undefined): string {
  if (!label) return "?";
  const cleaned = label.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

interface Props {
  connectionId: string;
  table: Table;
  schema: Schema;
  analysis: TableAnalysis | undefined;
  pkSegment: string;
}

export function UserDetail({ connectionId, table, schema, analysis, pkSegment }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const editMode = sp.get("edit") === "1";

  const pkValue = useMemo(() => decodePkSegment(table, pkSegment), [table, pkSegment]);
  const { data: row, isLoading, error } = useRow(connectionId, table, pkValue);
  const deleteRow = useDeleteRow(connectionId, table);
  const insertRow = useInsertRow(connectionId, table);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const primary = analysis?.primary;
  const emailCol = primary?.subtitleColumn ?? findColumn(table, EMAIL_PATTERNS);
  const nameCol =
    primary?.titleColumn ?? findColumn(table, NAME_PATTERNS) ?? analysis?.titleColumn ?? null;
  const handleCol = findColumn(table, HANDLE_PATTERNS);
  const avatarCol = primary?.avatarColumn ?? findColumn(table, AVATAR_PATTERNS);
  const roleCol = findColumn(table, ROLE_PATTERNS);
  const statusCol =
    primary?.badgeColumn ?? findColumn(table, STATUS_PATTERNS) ?? analysis?.statusColumn ?? null;
  const lastSeenCol = findColumn(table, LAST_SEEN_PATTERNS);
  const createdCol = findColumn(table, CREATED_PATTERNS);

  const heroCols = useMemo(() => {
    return new Set(
      [nameCol, emailCol, handleCol, avatarCol, roleCol, statusCol, lastSeenCol, createdCol].filter(
        Boolean,
      ) as string[],
    );
  }, [nameCol, emailCol, handleCol, avatarCol, roleCol, statusCol, lastSeenCol, createdCol]);

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

  const displayName = analysis?.displayName ?? "Users";
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const breadcrumbs = [
    { label: "Tables", href: `/c/${connectionId}/tables` },
    { label: displayName, href: tableHref },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={breadcrumbs} title="User" />
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
        <div className="surface rounded-md p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const fallbackId = table.primaryKey[0] ? row[table.primaryKey[0]] : null;
  const name = (nameCol && row[nameCol] != null ? String(row[nameCol]) : null) ?? null;
  const email = emailCol && row[emailCol] != null ? String(row[emailCol]) : null;
  const handle = handleCol && row[handleCol] != null ? String(row[handleCol]) : null;
  const avatar = avatarCol && row[avatarCol] != null ? String(row[avatarCol]) : null;
  const role = roleCol && row[roleCol] != null ? String(row[roleCol]) : null;
  const status = statusCol && row[statusCol] != null ? String(row[statusCol]) : null;
  const display = name || email || handle || (fallbackId != null ? String(fallbackId) : "user");
  const lastSeenRel = lastSeenCol ? relativeFromNow(row[lastSeenCol] as string) : null;
  const createdRel = createdCol ? relativeFromNow(row[createdCol] as string) : null;

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
      toast.success(`User deleted from ${table.name}`, {
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

  // Group the remaining (non-hero, non-hidden) columns for the read view.
  const idSet = new Set(table.primaryKey);
  const remaining = table.columns.filter(
    (c) => !heroCols.has(c.name) && !hidden.has(c.name),
  );
  const sections: Array<{ title: string; cols: Column[] }> = [
    { title: "Identifiers", cols: remaining.filter((c) => idSet.has(c.name)) },
    { title: "Profile", cols: remaining.filter((c) => !idSet.has(c.name) && !META_RE.test(c.name)) },
    { title: "Activity", cols: remaining.filter((c) => META_RE.test(c.name) && !idSet.has(c.name)) },
  ].filter((s) => s.cols.length > 0);

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
              {email && (
                <Button asChild variant="ghost" size="md">
                  <a href={`mailto:${email}`}>
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    Email
                  </a>
                </Button>
              )}
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

      <section className="surface relative overflow-hidden rounded-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/10 to-transparent"
        />
        <div className="relative flex flex-wrap items-start gap-5 p-6">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border hairline-strong bg-bg-sunken">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-2xl text-fg-muted">
                {initials(display)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-2xl leading-tight">{display}</h2>
              {status && <StatusPill value={status} />}
              {role && (
                <span className="inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
                  <ShieldCheck className="h-3 w-3" aria-hidden />
                  {role}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
              {email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                  <a className="hover:text-fg" href={`mailto:${email}`}>{email}</a>
                </span>
              )}
              {handle && <span>@{handle}</span>}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-xs">
              {createdRel && (
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Joined</dt>
                  <dd className="mt-0.5 text-fg">{createdRel}</dd>
                </div>
              )}
              {lastSeenRel && (
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Last seen</dt>
                  <dd className="mt-0.5 text-fg">{lastSeenRel}</dd>
                </div>
              )}
              {table.primaryKey.length > 0 && (
                <div className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">ID</dt>
                  <dd className="mt-0.5 truncate font-mono text-fg" title={String(fallbackId ?? "")}>
                    {String(fallbackId ?? "")}
                  </dd>
                </div>
              )}
            </dl>
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
                <p className="text-xs text-fg-muted">
                  No other tables reference this user.
                </p>
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


// Default export so the dispatcher can lazy-load it via next/dynamic.
export default UserDetail;
