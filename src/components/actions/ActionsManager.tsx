"use client";

/**
 * Connection-scoped management surface for custom actions:
 * list / create / edit / delete.
 *
 * Inline form rather than a separate page because actions are short
 * configs (≤ ~10 fields) and most users will iterate on them in place.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Webhook,
  Zap,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/lib/ui/use-confirm";
import type {
  ActionKind,
  ActionParam,
  ActionParamType,
  ActionScope,
  ActionSummary,
  ActionWebhookMethod,
} from "@/lib/actions/types";
import { ActionRunner } from "./ActionRunner";

interface ManagerProps {
  connectionId: string;
}

async function fetchActions(connectionId: string): Promise<ActionSummary[]> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/actions`);
  if (!res.ok) throw new AppError("server", "Failed to load actions.");
  const j = (await res.json()) as { actions: ActionSummary[] };
  return j.actions;
}

export function ActionsManager({ connectionId }: ManagerProps) {
  const qc = useQueryClient();
  const { data: actions = [], isLoading } = useQuery({
    queryKey: ["actions", connectionId],
    queryFn: () => fetchActions(connectionId),
  });

  const [editing, setEditing] = useState<ActionSummary | "new" | null>(null);
  const [runningInline, setRunningInline] = useState<ActionSummary | null>(null);
  const confirmDelete = useConfirm();
  const [deleteTarget, setDeleteTarget] = useState<string>("");

  const onDelete = useCallback(
    async (action: ActionSummary) => {
      setDeleteTarget(action.label);
      confirmDelete.ask(async () => {
        const res = await fetch(
          `/api/connections/${encodeURIComponent(connectionId)}/actions/${encodeURIComponent(action.id)}`,
          { method: "DELETE" },
        );
        if (res.status === 204) {
          toast.success("Action deleted.");
          qc.invalidateQueries({ queryKey: ["actions", connectionId] });
        } else {
          toast.error("Delete failed.");
        }
      });
    },
    [connectionId, qc, confirmDelete],
  );

  const grouped = useMemo(() => groupByScope(actions), [actions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          Buttons that run business logic on this connection, SQL templates or
          webhooks, surfaced on tables and rows.
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-3 w-3" aria-hidden />
          New action
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-md border hairline bg-bg-raised px-4 py-6 text-sm text-fg-muted">
          Loading actions…
        </div>
      ) : actions.length === 0 ? (
        <EmptyState onNew={() => setEditing("new")} />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ scope, items }) => (
            <ScopeSection
              key={scope}
              scope={scope}
              items={items}
              onEdit={(a) => setEditing(a)}
              onDelete={onDelete}
              onRun={(a) => setRunningInline(a)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ActionFormDialog
          connectionId={connectionId}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["actions", connectionId] });
            setEditing(null);
          }}
        />
      )}

      {/* Lazy: a tiny inline runner so the manager can also test actions */}
      {runningInline && (
        <Dialog open onOpenChange={(o) => !o && setRunningInline(null)}>
          <DialogContent className="max-w-md">
            <DialogTitle className="sr-only">Run {runningInline.label}</DialogTitle>
            <DialogDescription className="sr-only">
              Run this action against your connection from the manager.
            </DialogDescription>
            <p className="mb-2 text-xs text-fg-muted">
              Running from the manager. For row-scoped actions you&apos;ll need to run from a row page to bind a primary key.
            </p>
            <ActionRunner
              connectionId={connectionId}
              surface={runningInline.scope === "row" ? "row" : runningInline.scope}
              tableSchema={runningInline.tableSchema ?? undefined}
              tableName={runningInline.tableName ?? undefined}
              initialActions={[runningInline]}
            />
          </DialogContent>
        </Dialog>
      )}
      <ConfirmDialog
        {...confirmDelete.dialogProps}
        title="Delete action?"
        description={
          <>
            Permanently deletes <strong>{deleteTarget}</strong>. Any saved
            references to this action (in dashboards, custom workflows) will
            stop working.
          </>
        }
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}

function groupByScope(actions: ActionSummary[]): Array<{ scope: ActionScope; items: ActionSummary[] }> {
  const buckets = new Map<ActionScope, ActionSummary[]>();
  for (const a of actions) {
    if (!buckets.has(a.scope)) buckets.set(a.scope, []);
    buckets.get(a.scope)!.push(a);
  }
  const order: ActionScope[] = ["global", "table", "row"];
  return order
    .filter((s) => buckets.has(s))
    .map((s) => ({ scope: s, items: buckets.get(s) ?? [] }));
}

function ScopeSection({
  scope,
  items,
  onEdit,
  onDelete,
  onRun,
}: {
  scope: ActionScope;
  items: ActionSummary[];
  onEdit: (a: ActionSummary) => void;
  onDelete: (a: ActionSummary) => void;
  onRun: (a: ActionSummary) => void;
}) {
  const title =
    scope === "global"
      ? "Global"
      : scope === "table"
      ? "Table-scoped"
      : "Row-scoped";
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
        {title} · {items.length}
      </h3>
      <ul className="divide-y hairline overflow-hidden rounded-md border hairline bg-bg-raised">
        {items.map((a) => (
          <li key={a.id} className="flex items-start gap-3 px-3 py-2.5">
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded border hairline bg-bg">
              {a.kind === "webhook" ? (
                <Webhook className="h-3 w-3 text-accent" aria-hidden />
              ) : (
                <Zap className="h-3 w-3 text-accent" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate font-mono text-sm">{a.name}</span>
                <span className="text-fg-faint">·</span>
                <span className="truncate text-sm text-fg-muted">{a.label}</span>
                {a.danger && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                    danger
                  </span>
                )}
                {a.readOnly && a.kind === "sql" && (
                  <span className="rounded-full border hairline px-1.5 py-0.5 text-[10px] text-fg-faint">
                    read-only
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-faint">
                {a.scope !== "global" && a.tableName && (
                  <span className="font-mono">{a.tableSchema}.{a.tableName}</span>
                )}
                {a.params.length > 0 && (
                  <span>
                    {a.params.length} param{a.params.length === 1 ? "" : "s"}
                  </span>
                )}
                {a.description && <span className="line-clamp-1">{a.description}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="secondary" onClick={() => onRun(a)}>
                <Play className="h-3 w-3" aria-hidden />
                Run
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onEdit(a)} aria-label="Edit">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onDelete(a)} aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-md border hairline bg-bg-raised px-6 py-10 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/10">
        <Zap className="h-4 w-4 text-accent" aria-hidden />
      </div>
      <h3 className="mt-3 font-display text-base">No actions yet</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
        Define a button that runs a SQL template or fires a webhook -
        &quot;Refund&quot;, &quot;Approve&quot;, &quot;Resend invite&quot;, etc.
        It&apos;ll appear on the table or row page you scope it to.
      </p>
      <Button className="mt-4" size="sm" onClick={onNew}>
        <Plus className="h-3 w-3" aria-hidden />
        Create the first action
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form dialog
// ---------------------------------------------------------------------------

interface FormDialogProps {
  connectionId: string;
  initial: ActionSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

interface GeneratedActionShape {
  name: string;
  label: string;
  description?: string | null;
  scope: ActionScope;
  tableSchema?: string | null;
  tableName?: string | null;
  kind: ActionKind;
  sqlTemplate?: string | null;
  readOnly?: boolean;
  webhookUrl?: string | null;
  webhookMethod?: ActionWebhookMethod | null;
  params?: ActionParam[];
  danger?: boolean;
}

interface FormState {
  name: string;
  label: string;
  description: string;
  scope: ActionScope;
  tableSchema: string;
  tableName: string;
  kind: ActionKind;
  sqlTemplate: string;
  readOnly: boolean;
  webhookUrl: string;
  webhookMethod: ActionWebhookMethod;
  params: ActionParam[];
  danger: boolean;
}

function blankForm(): FormState {
  return {
    name: "",
    label: "",
    description: "",
    scope: "row",
    tableSchema: "public",
    tableName: "",
    kind: "sql",
    sqlTemplate: "",
    readOnly: false,
    webhookUrl: "",
    webhookMethod: "POST",
    params: [],
    danger: false,
  };
}

function ActionFormDialog({ connectionId, initial, onClose, onSaved }: FormDialogProps) {
  const [form, setForm] = useState<FormState>(() => {
    if (!initial) return blankForm();
    return {
      name: initial.name,
      label: initial.label,
      description: initial.description ?? "",
      scope: initial.scope,
      tableSchema: initial.tableSchema ?? "public",
      tableName: initial.tableName ?? "",
      kind: initial.kind,
      sqlTemplate: initial.sqlTemplate ?? "",
      readOnly: initial.readOnly,
      webhookUrl: initial.webhookUrl ?? "",
      webhookMethod: initial.webhookMethod ?? "POST",
      params: initial.params,
      danger: initial.danger,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initial;

  // AI-generate state. Same shape as the widget builder — collapsible
  // panel, prompt textarea, populate the form on success. There's no
  // executable preview here (writes would actually fire, webhooks
  // would actually call third-party hosts), so the safety pass is
  // structural validation on the server side only.
  const [aiOpen, setAiOpen] = useState(!isEdit);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);

  const runAi = useCallback(async () => {
    if (aiBusy || aiPrompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/actions/ai-generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: aiPrompt,
            // Pass the form's current context so the model gets
            // pre-narrowed defaults. The model can still override.
            scope: form.scope,
            kind: form.kind,
            tableSchema: form.scope !== "global" ? form.tableSchema : undefined,
            tableName: form.scope !== "global" ? form.tableName || undefined : undefined,
          }),
        },
      );
      const j = (await res.json().catch(() => ({}))) as {
        action?: {
          name: string;
          label: string;
          description?: string | null;
          scope: ActionScope;
          tableSchema?: string | null;
          tableName?: string | null;
          kind: ActionKind;
          sqlTemplate?: string | null;
          readOnly?: boolean;
          webhookUrl?: string | null;
          webhookMethod?: ActionWebhookMethod | null;
          params?: ActionParam[];
          danger?: boolean;
        };
        message?: string;
        model?: string;
      };
      if (!res.ok || !j.action) {
        setAiError(j.message ?? `HTTP ${res.status}`);
        // Even on a 422 the body carries the action, so the user can
        // see what the model produced and edit it inline.
        if (j.action) {
          populateFromGenerated(j.action);
        }
        return;
      }
      populateFromGenerated(j.action);
      setAiModel(j.model ?? null);
      toast.success("Action generated. Review and save.");
    } catch (e) {
      setAiError((e as Error).message ?? "Generation failed.");
    } finally {
      setAiBusy(false);
    }

    function populateFromGenerated(a: GeneratedActionShape): void {
      setForm((prev) => ({
        ...prev,
        name: a.name.slice(0, 40),
        label: a.label.slice(0, 60),
        description: (a.description ?? "").slice(0, 200),
        scope: a.scope,
        tableSchema: a.tableSchema ?? prev.tableSchema,
        tableName: a.tableName ?? prev.tableName,
        kind: a.kind,
        sqlTemplate: a.sqlTemplate ?? prev.sqlTemplate,
        readOnly: a.readOnly ?? prev.readOnly,
        webhookUrl: a.webhookUrl ?? prev.webhookUrl,
        webhookMethod: a.webhookMethod ?? prev.webhookMethod,
        params: a.params ?? prev.params,
        danger: a.danger ?? prev.danger,
      }));
    }
  }, [aiBusy, aiPrompt, connectionId, form.kind, form.scope, form.tableName, form.tableSchema]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        label: form.label.trim(),
        description: form.description.trim() || null,
        scope: form.scope,
        tableSchema: form.scope === "global" ? null : form.tableSchema.trim(),
        tableName: form.scope === "global" ? null : form.tableName.trim(),
        kind: form.kind,
        sqlTemplate: form.kind === "sql" ? form.sqlTemplate : null,
        readOnly: form.kind === "sql" ? form.readOnly : false,
        webhookUrl: form.kind === "webhook" ? form.webhookUrl.trim() : null,
        webhookMethod: form.kind === "webhook" ? form.webhookMethod : null,
        webhookHeaders: null,
        params: form.params,
        danger: form.danger,
      };
      const url = isEdit
        ? `/api/connections/${encodeURIComponent(connectionId)}/actions/${encodeURIComponent(initial.id)}`
        : `/api/connections/${encodeURIComponent(connectionId)}/actions`;
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
      toast.success(isEdit ? "Action updated." : "Action created.");
      onSaved();
    } catch (e) {
      setError((e as Error).message ?? "Save failed.");
      setSaving(false);
    }
  }, [connectionId, form, initial?.id, isEdit, onSaved]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{isEdit ? "Edit action" : "New action"}</DialogTitle>
        <DialogDescription>
          A button on table or row pages that runs SQL or fires a webhook.
        </DialogDescription>

        {/* AI-generate panel. Default open on create, closed on edit.
            No live preview here — actions write to the project, so the
            safety pass is structural validation (placeholder counts,
            webhook URL safety) done server-side. */}
        <section className="rounded-lg border hairline bg-bg-sunken/40">
          <button
            type="button"
            onClick={() => setAiOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-sunken/60"
            aria-expanded={aiOpen}
          >
            {aiOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden />
            )}
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            <span className="font-display">Generate with AI</span>
            <span className="ml-1 text-xs text-fg-faint">
              describe what the button should do, we build the SQL or webhook config
            </span>
          </button>
          {aiOpen && (
            <div className="space-y-2 border-t hairline px-3 py-3">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={2}
                placeholder="e.g. 'mark this order as shipped' or 'refund this order via Stripe webhook' or 'archive all users not seen in 90 days'"
                className="!text-sm"
                aria-label="Describe the action you want"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-fg-faint">
                  Uses your OpenRouter key on the model set in{" "}
                  <a href="/settings/ai" className="text-accent hover:underline">
                    Settings &rarr; AI
                  </a>
                  . SQL placeholder counts + webhook URL safety are validated server-side.
                  {aiModel && (
                    <span className="ml-1 font-mono text-fg-muted">
                      via {aiModel}
                    </span>
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={runAi}
                  disabled={aiBusy || aiPrompt.trim().length < 3}
                >
                  {aiBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-3 w-3" aria-hidden />
                  )}
                  {aiBusy ? "Generating…" : "Generate"}
                </Button>
              </div>
              {aiError && (
                <div className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>
                    {aiError}{" "}
                    <span className="text-fg-muted">
                      The form below was populated with the model&apos;s output so you can edit it directly.
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" hint="slug used in URLs and audit logs">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="refund-order"
                required
              />
            </Field>
            <Field label="Label" hint="text on the button">
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Refund order"
                required
              />
            </Field>
          </div>

          <Field label="Description" hint="optional, shown in tooltip">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Refunds the order via Stripe and marks it cancelled."
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Scope">
              <Select
                value={form.scope}
                onValueChange={(v) => setForm({ ...form, scope: v as ActionScope })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (connection)</SelectItem>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="row">Row</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Kind">
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as ActionKind })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sql">SQL template</SelectItem>
                  <SelectItem value="webhook">Webhook (HTTP)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {form.scope !== "global" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Schema">
                <Input
                  value={form.tableSchema}
                  onChange={(e) => setForm({ ...form, tableSchema: e.target.value })}
                  placeholder="public"
                />
              </Field>
              <Field label="Table">
                <Input
                  value={form.tableName}
                  onChange={(e) => setForm({ ...form, tableName: e.target.value })}
                  placeholder="orders"
                  required
                />
              </Field>
            </div>
          )}

          {form.kind === "sql" ? (
            <>
              <Field
                label="SQL template"
                hint={
                  form.scope === "row"
                    ? "Use $1 for the row's primary key (JSON), then $2..$N for params."
                    : "Use $1..$N to bind params in declaration order."
                }
              >
                <Textarea
                  rows={5}
                  value={form.sqlTemplate}
                  onChange={(e) => setForm({ ...form, sqlTemplate: e.target.value })}
                  placeholder="UPDATE orders SET status = 'refunded' WHERE id = ($1->>'id')::uuid"
                  className="font-mono !text-xs"
                />
              </Field>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={form.readOnly}
                  onChange={(e) => setForm({ ...form, readOnly: e.target.checked })}
                />
                Run inside a READ ONLY transaction (queries only, no mutations)
              </label>
            </>
          ) : (
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <Field label="Webhook URL">
                <Input
                  value={form.webhookUrl}
                  onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                  placeholder="https://api.example.com/refund"
                  required
                />
              </Field>
              <Field label="Method">
                <Select
                  value={form.webhookMethod}
                  onValueChange={(v) => setForm({ ...form, webhookMethod: v as ActionWebhookMethod })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          <ParamsEditor params={form.params} onChange={(p) => setForm({ ...form, params: p })} />

          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={form.danger}
              onChange={(e) => setForm({ ...form, danger: e.target.checked })}
            />
            Treat as a danger action (red button + typed confirmation)
          </label>

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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create action"}
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
  // Wrapping <label> auto-associates with the first interactive
  // descendant (input/select/textarea), so consumers don't need to
  // thread an id through. Adds accessible name without ceremony.
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] uppercase tracking-[0.16em] text-fg-faint">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-fg-faint">{hint}</span>}
    </label>
  );
}

function ParamsEditor({
  params,
  onChange,
}: {
  params: ActionParam[];
  onChange: (p: ActionParam[]) => void;
}) {
  const add = () =>
    onChange([
      ...params,
      { name: `param${params.length + 1}`, label: "Param", type: "string", required: false },
    ]);
  const update = (i: number, patch: Partial<ActionParam>) =>
    onChange(params.map((p, j) => (i === j ? { ...p, ...patch } : p)));
  const remove = (i: number) => onChange(params.filter((_, j) => j !== i));

  return (
    <div className="space-y-2 rounded-md border hairline bg-bg-sunken/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
          Parameters ({params.length})
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus className="h-3 w-3" aria-hidden />
          Add
        </Button>
      </div>
      {params.length === 0 ? (
        <p className="text-[11px] text-fg-faint">
          Optional. Each param becomes a form field at run time and binds to a $N placeholder.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {params.map((p, i) => (
            <li key={i} className="grid grid-cols-[1fr_1fr_8rem_5rem_2rem] gap-2 text-xs">
              <Input
                value={p.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="name"
                className="font-mono text-xs"
              />
              <Input
                value={p.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Label"
              />
              <select
                value={p.type}
                onChange={(e) => update(i, { type: e.target.value as ActionParamType })}
                className="rounded-md border hairline bg-bg px-2 text-xs"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="json">json</option>
              </select>
              <label className="flex cursor-pointer items-center gap-1 text-fg-muted">
                <input
                  type="checkbox"
                  checked={p.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                req
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                aria-label="Remove param"
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

