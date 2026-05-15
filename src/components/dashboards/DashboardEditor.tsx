"use client";

/**
 * Management surface for dashboard widgets: list + create + edit + delete.
 * Lives at /c/[id]/dashboard/edit. The read-only render of widgets on the
 * connection dashboard is in DashboardWidgets.tsx.
 */

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  LineChart as LineIcon,
  List,
  Pencil,
  Plus,
  Sigma,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type {
  WidgetSpan,
  WidgetSummary,
  WidgetType,
  WidgetVisConfig,
} from "@/lib/dashboards/types";

interface Props {
  connectionId: string;
}

async function fetchWidgets(connectionId: string): Promise<WidgetSummary[]> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/widgets`);
  if (!res.ok) throw new AppError("server", "Failed to load widgets.");
  const j = (await res.json()) as { widgets: WidgetSummary[] };
  return j.widgets;
}

export function DashboardEditor({ connectionId }: Props) {
  const qc = useQueryClient();
  const { data: widgets = [], isLoading } = useQuery({
    queryKey: ["widgets", connectionId],
    queryFn: () => fetchWidgets(connectionId),
  });
  const [editing, setEditing] = useState<WidgetSummary | "new" | null>(null);

  const onDelete = useCallback(
    async (w: WidgetSummary) => {
      if (!confirm(`Delete widget "${w.title}"?`)) return;
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/widgets/${encodeURIComponent(w.id)}`,
        { method: "DELETE" },
      );
      if (res.status === 204) {
        toast.success("Widget deleted.");
        qc.invalidateQueries({ queryKey: ["widgets", connectionId] });
      } else {
        toast.error("Delete failed.");
      }
    },
    [connectionId, qc],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          Pin SQL queries as KPI tiles or charts on your connection
          dashboard. All queries run read-only with a 5s timeout.
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-3 w-3" aria-hidden />
          New widget
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-md border hairline bg-bg-raised px-4 py-6 text-sm text-fg-muted">
          Loading widgets…
        </div>
      ) : widgets.length === 0 ? (
        <div className="rounded-md border hairline bg-bg-raised px-6 py-10 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/10">
            <BarChart3 className="h-4 w-4 text-accent" aria-hidden />
          </div>
          <h3 className="mt-3 font-display text-base">No widgets yet</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
            Add your first widget to start building a dashboard.
          </p>
          <Button className="mt-4" size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-3 w-3" aria-hidden />
            Add widget
          </Button>
        </div>
      ) : (
        <ul className="divide-y hairline overflow-hidden rounded-md border hairline bg-bg-raised">
          {widgets.map((w) => (
            <li key={w.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded border hairline bg-bg">
                {widgetIcon(w.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="truncate font-display text-sm">{w.title}</span>
                  <span className="font-mono text-[11px] text-fg-faint">{w.type}</span>
                  <span className="font-mono text-[11px] text-fg-faint">span={w.span}</span>
                  {w.refreshSec > 0 && (
                    <span className="font-mono text-[11px] text-fg-faint">
                      every {w.refreshSec}s
                    </span>
                  )}
                </div>
                <code className="mt-1 line-clamp-1 block font-mono text-[11px] text-fg-muted">
                  {w.sql}
                </code>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(w)} aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(w)} aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <WidgetFormDialog
          connectionId={connectionId}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["widgets", connectionId] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function widgetIcon(type: WidgetType) {
  if (type === "kpi") return <Sigma className="h-3 w-3 text-accent" aria-hidden />;
  if (type === "bar") return <BarChart3 className="h-3 w-3 text-accent" aria-hidden />;
  if (type === "line") return <LineIcon className="h-3 w-3 text-accent" aria-hidden />;
  return <List className="h-3 w-3 text-accent" aria-hidden />;
}

// ---------------------------------------------------------------------------
// Form dialog
// ---------------------------------------------------------------------------

interface FormDialogProps {
  connectionId: string;
  initial: WidgetSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  type: WidgetType;
  title: string;
  description: string;
  sql: string;
  span: WidgetSpan;
  refreshSec: number;
  valueColumn: string;
  labelColumn: string;
  unit: string;
  prefix: string;
  format: "number" | "currency" | "percent";
  columns: string;
}

function blank(): FormState {
  return {
    type: "kpi",
    title: "",
    description: "",
    sql: "SELECT count(*) AS value FROM auth.users",
    span: "1",
    refreshSec: 0,
    valueColumn: "value",
    labelColumn: "",
    unit: "",
    prefix: "",
    format: "number",
    columns: "",
  };
}

function fromWidget(w: WidgetSummary): FormState {
  const v = w.visConfig;
  return {
    type: w.type,
    title: w.title,
    description: w.description ?? "",
    sql: w.sql,
    span: w.span,
    refreshSec: w.refreshSec,
    valueColumn: v.valueColumn ?? "",
    labelColumn: v.labelColumn ?? "",
    unit: v.unit ?? "",
    prefix: v.prefix ?? "",
    format: v.format ?? "number",
    columns: (v.columns ?? []).join(", "),
  };
}

function WidgetFormDialog({ connectionId, initial, onClose, onSaved }: FormDialogProps) {
  const [form, setForm] = useState<FormState>(() => (initial ? fromWidget(initial) : blank()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!initial;

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const vis: WidgetVisConfig = {};
      if (form.type === "kpi") {
        if (form.valueColumn) vis.valueColumn = form.valueColumn;
        if (form.unit) vis.unit = form.unit;
        if (form.prefix) vis.prefix = form.prefix;
        vis.format = form.format;
      } else if (form.type === "bar" || form.type === "line") {
        if (form.labelColumn) vis.labelColumn = form.labelColumn;
        if (form.valueColumn) vis.valueColumn = form.valueColumn;
      } else if (form.type === "list") {
        const cols = form.columns
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (cols.length > 0) vis.columns = cols;
      }
      const body = {
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        sql: form.sql,
        visConfig: vis,
        span: form.span,
        refreshSec: form.refreshSec,
      };
      const url = isEdit
        ? `/api/connections/${encodeURIComponent(connectionId)}/widgets/${encodeURIComponent(initial.id)}`
        : `/api/connections/${encodeURIComponent(connectionId)}/widgets`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        setError(j.message ?? `HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      toast.success(isEdit ? "Widget updated." : "Widget created.");
      onSaved();
    } catch (e) {
      setError((e as Error).message ?? "Save failed.");
      setSaving(false);
    }
  }, [connectionId, form, initial?.id, isEdit, onSaved]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{isEdit ? "Edit widget" : "New widget"}</DialogTitle>
        <DialogDescription>
          Saves a SQL query as a KPI tile, chart, or list on the dashboard.
        </DialogDescription>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_5rem]">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Weekly signups"
                required
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as WidgetType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kpi">KPI</SelectItem>
                  <SelectItem value="bar">Bar chart</SelectItem>
                  <SelectItem value="line">Line chart</SelectItem>
                  <SelectItem value="list">List</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Span">
              <Select
                value={form.span}
                onValueChange={(v) => setForm({ ...form, span: v as WidgetSpan })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="full">full</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Description" hint="optional, shown under the title">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Total signups this week"
            />
          </Field>

          <Field
            label="SQL"
            hint="Read-only, 5s timeout. SELECT into the column(s) you'll wire below."
          >
            <Textarea
              rows={5}
              value={form.sql}
              onChange={(e) => setForm({ ...form, sql: e.target.value })}
              className="font-mono !text-xs"
              required
            />
          </Field>

          {form.type === "kpi" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label="Value column">
                <Input
                  value={form.valueColumn}
                  onChange={(e) => setForm({ ...form, valueColumn: e.target.value })}
                  placeholder="value"
                />
              </Field>
              <Field label="Format">
                <Select
                  value={form.format}
                  onValueChange={(v) => setForm({ ...form, format: v as "number" | "currency" | "percent" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">number</SelectItem>
                    <SelectItem value="currency">currency ($)</SelectItem>
                    <SelectItem value="percent">percent</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prefix" hint="e.g. $, +">
                <Input
                  value={form.prefix}
                  onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                />
              </Field>
              <Field label="Unit" hint="e.g. ms, users">
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </Field>
            </div>
          )}

          {(form.type === "bar" || form.type === "line") && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Label column"
                hint={form.type === "line" ? "X axis (usually a date)" : "row label"}
              >
                <Input
                  value={form.labelColumn}
                  onChange={(e) => setForm({ ...form, labelColumn: e.target.value })}
                  placeholder="bucket"
                />
              </Field>
              <Field label="Value column">
                <Input
                  value={form.valueColumn}
                  onChange={(e) => setForm({ ...form, valueColumn: e.target.value })}
                  placeholder="value"
                />
              </Field>
            </div>
          )}

          {form.type === "list" && (
            <Field
              label="Visible columns"
              hint="Comma-separated. Empty = show first 6 columns from the query."
            >
              <Input
                value={form.columns}
                onChange={(e) => setForm({ ...form, columns: e.target.value })}
                placeholder="id, name, created_at"
              />
            </Field>
          )}

          <Field
            label="Refresh"
            hint="Auto re-run every N seconds (0 = on demand)."
          >
            <Input
              type="number"
              min={0}
              max={3600}
              value={form.refreshSec}
              onChange={(e) => setForm({ ...form, refreshSec: Number(e.target.value) || 0 })}
              className="w-32"
            />
          </Field>

          {error && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t hairline pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create widget"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5")}>
      <label className="block text-[11px] uppercase tracking-[0.16em] text-fg-faint">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-fg-faint">{hint}</p>}
    </div>
  );
}
