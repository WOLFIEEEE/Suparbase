"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateRow } from "@/lib/api/hooks";
import { formatCellValue } from "@/lib/table/cellFormat";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { Column, PrimaryKeyValue, Table } from "@/lib/types/schema";

interface Props {
  col: Column;
  value: unknown;
  connectionId: string;
  table: Table;
  pk: PrimaryKeyValue | null;
}

const NEVER_INLINE_EDIT = new Set(["json"] as const);

/**
 * Field display with double-click-to-edit. Falls back to read-only rendering
 * when the column or table doesn't support PATCH (views, generated columns,
 * primary key, no-PK tables, JSON columns, FKs).
 */
export function EditableField({ col, value, connectionId, table, pk }: Props) {
  const formatted = formatCellValue(col, value);

  const readOnly =
    table.kind === "view" ||
    pk === null ||
    col.isPrimaryKey ||
    col.isGenerated ||
    !!col.fk ||
    NEVER_INLINE_EDIT.has(col.category as "json");

  // JSON stays expanded by default (existing UX).
  if (col.category === "json" && value != null) {
    return (
      <FieldShell colName={col.name}>
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
      </FieldShell>
    );
  }

  if (readOnly) {
    return (
      <FieldShell colName={col.name}>
        <ReadOnlyValue col={col} value={value} formatted={formatted} />
      </FieldShell>
    );
  }

  return (
    <FieldShell colName={col.name}>
      <Editor
        col={col}
        value={value}
        connectionId={connectionId}
        table={table}
        pk={pk}
      />
    </FieldShell>
  );
}

function FieldShell({
  colName,
  children,
}: {
  colName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="contents">
      <dt className="font-mono text-xs text-fg-muted">{colName}</dt>
      <dd className="min-w-0 font-mono text-xs">{children}</dd>
    </div>
  );
}

function ReadOnlyValue({
  col,
  value,
  formatted,
}: {
  col: Column;
  value: unknown;
  formatted: ReturnType<typeof formatCellValue>;
}) {
  if (col.category === "boolean" && value != null) {
    return (
      <span
        className={cn(
          "inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
          value ? "bg-accent/10 text-accent" : "bg-line/40 text-fg-muted",
        )}
      >
        {String(value)}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "whitespace-pre-wrap break-words",
        formatted.isNull && "italic text-fg-faint",
      )}
    >
      {formatted.text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function valueToInputString(_col: Column, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function inputStringToValue(col: Column, raw: string): unknown {
  if (raw === "" || raw === "​") {
    return col.nullable ? null : "";
  }
  if (col.category === "boolean") {
    return raw === "true";
  }
  if (col.category === "integer") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : raw;
  }
  if (col.category === "float") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

function Editor({
  col,
  value,
  connectionId,
  table,
  pk,
}: {
  col: Column;
  value: unknown;
  connectionId: string;
  table: Table;
  pk: PrimaryKeyValue;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => valueToInputString(col, value));
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null);
  const qc = useQueryClient();
  const update = useUpdateRow(connectionId, table);

  // Keep the draft in sync with external value changes (after save / refresh).
  useEffect(() => {
    if (!editing) setDraft(valueToInputString(col, value));
  }, [col, value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select?.();
      }
    }
  }, [editing]);

  function startEdit() {
    if (!editing && !update.isPending) {
      setDraft(valueToInputString(col, value));
      setEditing(true);
    }
  }

  function cancel() {
    setDraft(valueToInputString(col, value));
    setEditing(false);
  }

  async function commit() {
    const next = inputStringToValue(col, draft);
    if (sameValue(value, next)) {
      setEditing(false);
      return;
    }
    try {
      await update.mutateAsync({ pk, patch: { [col.name]: next } });
      qc.invalidateQueries({
        queryKey: ["row", connectionId, table.schema, table.name, pk],
      });
      toast.success(`Updated ${col.name}`);
      setEditing(false);
    } catch (e) {
      const app = e instanceof AppError ? e : new AppError("client_bug", (e as Error).message);
      toast.error(`Could not update ${col.name}: ${app.message}`);
    }
  }

  if (!editing) {
    const formatted = formatCellValue(col, value);
    return (
      <button
        type="button"
        onClick={startEdit}
        onDoubleClick={startEdit}
        title="Double-click to edit"
        className={cn(
          "group -mx-1 inline-flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs transition-colors",
          "hover:bg-bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        )}
      >
        <ReadOnlyValue col={col} value={value} formatted={formatted} />
        <Pencil
          className="h-3 w-3 shrink-0 text-fg-faint transition-opacity md:opacity-0 md:group-hover:opacity-100"
          aria-hidden
        />
      </button>
    );
  }

  // Enum → select; boolean → select true/false (+ null if nullable); else text input.
  const sharedClass = cn(
    "min-w-0 flex-1 rounded border hairline bg-bg-raised px-2 py-1 text-xs",
    "focus:border-line-strong focus:outline-none focus-visible:ring-1 focus-visible:ring-accent",
  );

  // Use the column name as the accessible name so screen readers
  // announce "Edit <column>" when the user enters edit mode.
  const editorAriaLabel = `Edit ${col.name}`;

  let field: React.ReactNode;
  if (col.category === "enum" && col.enumValues) {
    field = (
      <select
        ref={(el) => {
          inputRef.current = el;
        }}
        aria-label={editorAriaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter") void commit();
        }}
        className={sharedClass}
      >
        {col.nullable && <option value="">— NULL —</option>}
        {col.enumValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  } else if (col.category === "boolean") {
    field = (
      <select
        ref={(el) => {
          inputRef.current = el;
        }}
        aria-label={editorAriaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter") void commit();
        }}
        className={sharedClass}
      >
        {col.nullable && <option value="">— NULL —</option>}
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else if (col.category === "text") {
    field = (
      <textarea
        ref={(el) => {
          inputRef.current = el;
        }}
        aria-label={editorAriaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
        }}
        rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 60)))}
        className={cn(sharedClass, "min-h-[2.5rem] resize-y")}
        placeholder="(text: ⌘/Ctrl+Enter to save)"
      />
    );
  } else {
    field = (
      <input
        ref={(el) => {
          inputRef.current = el;
        }}
        aria-label={editorAriaLabel}
        type={inputTypeFor(col)}
        // Float columns need step="any" so values like 0.25 don't get
        // rejected by the browser's default step=1 enforcement.
        step={col.category === "float" ? "any" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter") void commit();
        }}
        className={sharedClass}
      />
    );
  }

  return (
    <span className="flex items-center gap-1">
      {field}
      {update.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
      ) : (
        <>
          <button
            type="button"
            // mousedown so it fires before blur cancels the edit
            onMouseDown={(e) => {
              e.preventDefault();
              void commit();
            }}
            className="rounded p-1.5 text-fg-muted hover:bg-accent/10 hover:text-accent"
            aria-label="Save"
          >
            <Check className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              cancel();
            }}
            className="rounded p-1.5 text-fg-muted hover:bg-bg-sunken hover:text-fg"
            aria-label="Cancel"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </>
      )}
    </span>
  );
}

function inputTypeFor(col: Column): string {
  switch (col.category) {
    case "integer":
    case "float":
      return "number";
    case "date":
      return "date";
    case "datetime":
      return "datetime-local";
    default:
      return "text";
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}
