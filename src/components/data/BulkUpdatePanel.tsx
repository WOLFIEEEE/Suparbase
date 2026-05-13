"use client";
import { useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Table, Row } from "@/lib/types/schema";

interface Props {
  open: boolean;
  table: Table;
  count: number;
  onCancel: () => void;
  onConfirm: (patch: Row) => void;
  pending?: boolean;
}

interface ColumnPick {
  column: string;
  value: unknown;
}

/**
 * Bulk-update panel. The user picks one or more writable columns, supplies
 * new values, sees a preview ("apply column = value to N rows?"), confirms.
 * Submit is disabled until every (column, value) pair is valid.
 */
export function BulkUpdatePanel({ open, table, count, onCancel, onConfirm, pending }: Props) {
  const writable = useMemo(
    () =>
      table.columns.filter(
        (c) => !c.isPrimaryKey && !c.isGenerated && c.category !== "json",
      ),
    [table.columns],
  );

  const [picks, setPicks] = useState<ColumnPick[]>([]);

  function addPick() {
    const used = new Set(picks.map((p) => p.column));
    const next = writable.find((c) => !used.has(c.name));
    if (!next) return;
    setPicks((p) => [...p, { column: next.name, value: defaultForColumn(next) }]);
  }

  function setPickAt(idx: number, patch: Partial<ColumnPick>) {
    setPicks((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeAt(idx: number) {
    setPicks((p) => p.filter((_, i) => i !== idx));
  }

  function reset() {
    setPicks([]);
  }

  const valid = picks.length > 0 && picks.every((p) => p.value !== undefined && p.value !== "");

  function submit() {
    const patch: Row = {};
    for (const p of picks) patch[p.column] = p.value;
    onConfirm(patch);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-fg-muted" aria-hidden />
            <DialogTitle>Update {count} {count === 1 ? "row" : "rows"}</DialogTitle>
          </div>
          <DialogDescription>
            Pick one or more columns and supply a new value. The same value is
            applied to every selected row.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {picks.length === 0 ? (
            <p className="text-xs text-fg-muted">No columns selected yet.</p>
          ) : (
            picks.map((pick, idx) => {
              const col = writable.find((c) => c.name === pick.column);
              if (!col) return null;
              return (
                <div key={`${pick.column}-${idx}`} className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[10rem] space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-fg-faint">
                      Column
                    </Label>
                    <Select
                      value={pick.column}
                      onValueChange={(v) =>
                        setPickAt(idx, { column: v, value: defaultForColumn(writable.find((c) => c.name === v) ?? col) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {writable.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name}
                            <span className="ml-2 text-fg-faint">· {c.category}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-[1.4] min-w-[10rem] space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-fg-faint">
                      New value
                    </Label>
                    <ValueEditor
                      column={col}
                      value={pick.value}
                      onChange={(v) => setPickAt(idx, { value: v })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAt(idx)}
                    aria-label={`Remove ${pick.column}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              );
            })
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={addPick}
            disabled={picks.length >= writable.length}
            className="text-xs"
          >
            + Add column
          </Button>
        </div>

        {valid && (
          <div className="surface-sunken rounded p-3 text-xs text-fg-muted">
            <span className="text-fg">Apply</span>{" "}
            {picks.map((p, i) => (
              <span key={p.column}>
                {i > 0 ? ", " : ""}
                <code className="font-mono text-fg">{p.column}</code> = <code className="font-mono text-fg">{formatPreview(p.value)}</code>
              </span>
            ))}{" "}
            <span className="text-fg">to {count} {count === 1 ? "row" : "rows"}.</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onCancel(); }} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || pending}>
            {pending ? "Applying…" : `Apply to ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultForColumn(col: Table["columns"][number]): unknown {
  if (col.category === "boolean") return false;
  if (col.category === "integer" || col.category === "float") return 0;
  return "";
}

function ValueEditor({
  column,
  value,
  onChange,
}: {
  column: Table["columns"][number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (column.category === "boolean") {
    return <Switch checked={value === true} onCheckedChange={onChange} />;
  }
  if (column.category === "enum" && column.enumValues && column.enumValues.length > 0) {
    return (
      <Select value={String(value ?? "")} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Pick…" />
        </SelectTrigger>
        <SelectContent>
          {column.enumValues.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (column.category === "integer" || column.category === "float") {
    return (
      <Input
        type="number"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    );
  }
  if (column.category === "date") {
    return (
      <Input
        type="date"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (column.category === "datetime") {
    return (
      <Input
        type="datetime-local"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function formatPreview(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (typeof v === "string" && v.length > 24) return `${v.slice(0, 24)}…`;
  return String(v);
}
