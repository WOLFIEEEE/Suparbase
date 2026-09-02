"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { AppError } from "@/lib/errors";
import { useInsertRow, useUpdateRow } from "@/lib/api/hooks";
import type { Row, Schema, Table } from "@/lib/types/schema";
import { defaultsForCreate, defaultsForDuplicate, defaultsForEdit } from "@/lib/forms/defaults";
import { pickField } from "@/lib/forms/fields";
import { extractPk, encodePkSegment } from "@/lib/table/pk";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";

type Mode = "create" | "edit";

interface RowFormProps {
  table: Table;
  schema: Schema;
  mode: Mode;
  initialRow?: Row;
  onCancel?: () => void;
  onSaved?: (row: Row) => void;
}

interface Group {
  title: string;
  cols: Table["columns"];
}

function groupColumns(table: Table, mode: Mode): Group[] {
  const idNames = new Set(table.primaryKey);
  const metaPattern = /^(created_at|updated_at|inserted_at|deleted_at)$/i;
  const ids: Table["columns"] = [];
  const meta: Table["columns"] = [];
  const content: Table["columns"] = [];
  for (const col of table.columns) {
    if (mode === "create" && col.isGenerated) continue;
    if (idNames.has(col.name)) ids.push(col);
    else if (metaPattern.test(col.name)) meta.push(col);
    else content.push(col);
  }
  const groups: Group[] = [];
  if (ids.length) groups.push({ title: "Identifiers", cols: ids });
  if (content.length) groups.push({ title: "Content", cols: content });
  if (meta.length) groups.push({ title: "Metadata", cols: meta });
  return groups;
}

export function RowForm({ table, schema, mode, initialRow, onCancel, onSaved }: RowFormProps) {
  const router = useRouter();
  const connectionId = useCurrentConnectionId();
  const insert = useInsertRow(connectionId, table);
  const update = useUpdateRow(connectionId, table);
  const submitting = insert.isPending || update.isPending;

  const groups = useMemo(() => groupColumns(table, mode), [table, mode]);

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    mode === "edit" && initialRow
      ? defaultsForEdit(table, initialRow)
      : initialRow
        ? defaultsForDuplicate(table, initialRow)
        : defaultsForCreate(table),
  );
  const [fieldError, setFieldError] = useState<{ column: string; message: string } | null>(null);
  const [formError, setFormError] = useState<AppError | null>(null);

  useEffect(() => {
    if (mode === "edit" && initialRow) {
      setValues(defaultsForEdit(table, initialRow));
    }
  }, [mode, initialRow, table]);

  function setField(name: string, next: unknown) {
    setValues((prev) => ({ ...prev, [name]: next }));
    if (fieldError?.column === name) setFieldError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);
    setFormError(null);
    try {
      if (mode === "create") {
        const inserted = await insert.mutateAsync(values);
        toast.success(`Row inserted into ${table.name}`);
        onSaved?.(inserted);
        const pk = extractPk(table, inserted);
        if (Object.keys(pk).length > 0) {
          router.replace(
            `/c/${connectionId}/tables/${encodeURIComponent(table.name)}/${encodePkSegment(pk)}`,
          );
        } else {
          router.push(`/c/${connectionId}/tables/${encodeURIComponent(table.name)}`);
        }
      } else {
        if (!initialRow) throw new Error("Missing initial row for edit");
        const pk = extractPk(table, initialRow);
        const updated = await update.mutateAsync({ pk, patch: values });
        toast.success("Row updated");
        onSaved?.(updated);
      }
    } catch (err) {
      const app = err instanceof AppError ? err : new AppError("client_bug", String((err as Error).message ?? err));
      if (app.columnHint) {
        setFieldError({ column: app.columnHint, message: app.message });
      } else {
        setFormError(app);
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {groups.map((g) => (
        <section key={g.title} className="space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">{g.title}</h3>
          <div className="space-y-4">
            {g.cols.map((col) => {
              const Field = pickField(col);
              const fieldId = `f-${col.name}`;
              const readonly = mode === "edit" && col.isGenerated;
              const showError = fieldError?.column === col.name;
              return (
                <div key={col.name} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor={fieldId}>
                      <span className="font-mono text-xs normal-case tracking-normal text-fg">{col.name}</span>
                      {!col.nullable && (
                        <span className="ml-2 text-[10px] text-danger" aria-label="required">
                          required
                        </span>
                      )}
                    </Label>
                    <span className="font-mono text-[10px] text-fg-faint">
                      {col.pgType}
                      {col.isPrimaryKey && " · pk"}
                      {col.isGenerated && " · generated"}
                    </span>
                  </div>
                  {readonly ? (
                    <div className="rounded border hairline bg-bg-sunken/60 px-3 py-2 font-mono text-xs text-fg-muted">
                      {initialRow?.[col.name] == null ? (
                        <span className="italic text-fg-faint">null</span>
                      ) : (
                        String(initialRow?.[col.name])
                      )}
                      <Badge className="ml-2" tone="warn">
                        read-only
                      </Badge>
                    </div>
                  ) : (
                    <Field
                      id={fieldId}
                      column={col}
                      table={table}
                      schema={schema}
                      value={values[col.name]}
                      onChange={(v) => setField(col.name, v)}
                    />
                  )}
                  {col.comment && <p className="text-[11px] text-fg-faint">{col.comment}</p>}
                  {showError && <p className="text-[11px] text-danger">{fieldError!.message}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {formError && <ErrorBanner error={formError} />}

      <div className="flex items-center justify-end gap-2 border-t hairline pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          <Save className="h-3.5 w-3.5" aria-hidden />
          {submitting ? "Saving…" : mode === "create" ? "Insert row" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
