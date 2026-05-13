import { useMemo, useState } from "react";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/workspace/EmptyState";
import { RowForm } from "@/components/row/RowForm";
import { DeleteRowDialog } from "@/components/row/DeleteRowDialog";
import { ErrorBanner } from "@/components/connect/ErrorBanner";
import { useDeleteRow, useInsertRow, useRow, useSchema } from "@/lib/api/hooks";
import { decodePkSegment } from "@/lib/table/pk";
import { formatCellValue } from "@/lib/table/cellFormat";
import { cn } from "@/lib/ui/cn";
import { AppError } from "@/lib/api/errors";

export function TableRowRoute() {
  const { name, pk } = useParams<{ name: string; pk: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const editMode = params.get("edit") === "1";

  const { data: schema, isLoading: schemaLoading } = useSchema();
  const table = useMemo(() => schema?.tables.find((t) => t.name === name), [schema, name]);
  const pkValue = useMemo(() => (table && pk ? decodePkSegment(table, pk) : null), [table, pk]);

  const { data: row, isLoading, error } = useRow(
    table ?? { schema: "public", name: "", columns: [], kind: "table", primaryKey: [], labelColumn: null },
    pkValue,
  );

  const deleteRow = useDeleteRow(table ?? { schema: "public", name: "", columns: [], kind: "table", primaryKey: [], labelColumn: null });
  const insertRow = useInsertRow(table ?? { schema: "public", name: "", columns: [], kind: "table", primaryKey: [], labelColumn: null });
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (schemaLoading) return null;
  if (!table) {
    return (
      <EmptyState
        title="Table not found"
        description={`No table named "${name}".`}
        action={<Button asChild variant="secondary"><Link to="/tables">All tables</Link></Button>}
      />
    );
  }

  if (error) {
    return (
      <ErrorBanner
        error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))}
      />
    );
  }

  const canEdit = table.kind === "table" && pkValue !== null;

  async function performDelete() {
    if (!pkValue || !row) return;
    const snapshot = row;
    try {
      await deleteRow.mutateAsync(pkValue);
      setConfirmDelete(false);
      toast.success(`Row deleted from ${table!.name}`, {
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
      navigate(`/tables/${encodeURIComponent(table!.name)}`);
    } catch (e) {
      const app = e instanceof AppError ? e : new AppError("client_bug", String((e as Error).message ?? e));
      toast.error(`Delete failed: ${app.message}`);
      setConfirmDelete(false);
    }
  }

  const rowLabel = useMemo(() => {
    if (!row || !table) return "";
    if (table.labelColumn && row[table.labelColumn] != null) return String(row[table.labelColumn]);
    return table.primaryKey.map((c) => String(row[c])).join(", ");
  }, [row, table]);

  return (
    <div className="space-y-6">
      <Link
        to={`/tables/${encodeURIComponent(table.name)}`}
        className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {table.name}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h1 className="truncate font-display text-display-md">
            {row && rowLabel ? rowLabel : "Row"}
          </h1>
          <p className="text-xs text-fg-muted font-mono">
            {table.name} · {table.primaryKey.length > 0 ? table.primaryKey.map((c) => `${c}=${pkValue?.[c]}`).join(", ") : "no PK"}
          </p>
        </div>
        {row && canEdit && !editMode && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setParams({ edit: "1" }, { replace: false })}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          </div>
        )}
        {table.kind === "view" && <Badge tone="warn">view · read-only</Badge>}
      </header>

      {isLoading || !row ? (
        <div className="surface rounded p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      ) : editMode && canEdit ? (
        <div className="surface rounded p-6">
          <RowForm
            table={table}
            schema={schema!}
            mode="edit"
            initialRow={row}
            onCancel={() => setParams({}, { replace: false })}
            onSaved={() => setParams({}, { replace: false })}
          />
        </div>
      ) : (
        <ReadView table={table} row={row} />
      )}

      {row && (
        <DeleteRowDialog
          open={confirmDelete}
          tableName={table.name}
          rowLabel={rowLabel}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={performDelete}
          pending={deleteRow.isPending}
        />
      )}
    </div>
  );
}

function ReadView({ table, row }: { table: ReturnType<typeof useSchema>["data"] extends infer S ? S extends { tables: Array<infer T> } ? T : never : never; row: Record<string, unknown> }) {
  const idNames = new Set(table.primaryKey);
  const metaPattern = /^(created_at|updated_at|inserted_at|deleted_at)$/i;
  const sections: Array<{ title: string; cols: typeof table.columns }> = [
    { title: "Identifiers", cols: table.columns.filter((c) => idNames.has(c.name)) },
    { title: "Content", cols: table.columns.filter((c) => !idNames.has(c.name) && !metaPattern.test(c.name)) },
    { title: "Metadata", cols: table.columns.filter((c) => metaPattern.test(c.name)) },
  ].filter((s) => s.cols.length > 0);

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <section key={s.title} className="surface rounded p-6 space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">{s.title}</h3>
          <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-[12rem_1fr]">
            {s.cols.map((col) => {
              const value = row[col.name];
              const formatted = formatCellValue(col, value);
              return (
                <div key={col.name} className="contents">
                  <dt className="font-mono text-xs text-fg-muted">{col.name}</dt>
                  <dd
                    className={cn(
                      "font-mono text-xs",
                      formatted.isNull && "italic text-fg-faint",
                    )}
                  >
                    {col.category === "json" && value != null ? (
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
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
