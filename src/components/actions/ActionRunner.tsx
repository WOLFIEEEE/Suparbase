"use client";

/**
 * Reusable action surface for table pages and row detail pages. Renders
 * a button strip for the actions in scope, opens a parameter / confirm
 * modal on click, executes via the API, and shows a result card.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Play, Webhook, X, Zap } from "lucide-react";
import { toast } from "sonner";
import type {
  ActionExecuteResult,
  ActionParam,
  ActionSummary,
} from "@/lib/actions/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

interface Props {
  connectionId: string;
  /** Filter rules:
   *  - `global` view: actions where `scope === "global"`.
   *  - `table` view: scope === "table" matching schema/table.
   *  - `row` view: scope === "row" matching schema/table; row PK is passed at execution.
   */
  surface: "global" | "table" | "row";
  tableSchema?: string;
  tableName?: string;
  primaryKey?: Record<string, unknown>;
  /** Optional: pre-loaded list to avoid an extra fetch (used on table page). */
  initialActions?: ActionSummary[];
  /** Optional: classes for the outer container. */
  className?: string;
}

async function fetchActions(connectionId: string): Promise<ActionSummary[]> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/actions`);
  if (!res.ok) throw new AppError("server", "Failed to load actions.");
  const json = (await res.json()) as { actions: ActionSummary[] };
  return json.actions;
}

export function ActionRunner({
  connectionId,
  surface,
  tableSchema,
  tableName,
  primaryKey,
  initialActions,
  className,
}: Props) {
  const { data: actions = initialActions ?? [] } = useQuery({
    queryKey: ["actions", connectionId],
    queryFn: () => fetchActions(connectionId),
    initialData: initialActions,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    return actions.filter((a) => {
      if (surface === "global") return a.scope === "global";
      if (surface === "table") {
        return a.scope === "table" && a.tableSchema === tableSchema && a.tableName === tableName;
      }
      // row surface: row-scoped actions for this table
      return a.scope === "row" && a.tableSchema === tableSchema && a.tableName === tableName;
    });
  }, [actions, surface, tableSchema, tableName]);

  const [activeAction, setActiveAction] = useState<ActionSummary | null>(null);

  if (filtered.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filtered.map((a) => (
        <ActionButton
          key={a.id}
          action={a}
          onClick={() => setActiveAction(a)}
        />
      ))}
      {activeAction && (
        <ActionDialog
          connectionId={connectionId}
          action={activeAction}
          primaryKey={primaryKey}
          tableSchema={tableSchema}
          tableName={tableName}
          onClose={() => setActiveAction(null)}
        />
      )}
    </div>
  );
}

function ActionButton({
  action,
  onClick,
}: {
  action: ActionSummary;
  onClick: () => void;
}) {
  const Icon = action.kind === "webhook" ? Webhook : Zap;
  return (
    <Button
      type="button"
      size="sm"
      variant={action.danger ? "danger" : "secondary"}
      onClick={onClick}
      title={action.description ?? action.name}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {action.label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Execution dialog: param form → confirm (if danger) → run → result
// ---------------------------------------------------------------------------

interface DialogProps {
  connectionId: string;
  action: ActionSummary;
  primaryKey?: Record<string, unknown>;
  tableSchema?: string;
  tableName?: string;
  onClose: () => void;
}

type Stage = "form" | "confirm" | "running" | "result" | "error";

function ActionDialog({ connectionId, action, primaryKey, onClose, tableSchema, tableName }: DialogProps) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const p of action.params) initial[p.name] = "";
    return initial;
  });
  const [stage, setStage] = useState<Stage>(action.params.length > 0 ? "form" : action.danger ? "confirm" : "form");
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<ActionExecuteResult | null>(null);
  const [error, setError] = useState<{ category: string; message: string } | null>(null);

  const run = useCallback(async () => {
    setStage("running");
    setError(null);
    try {
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/actions/${encodeURIComponent(
          action.id,
        )}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: values, primaryKey }),
        },
      );
      const data = (await res.json()) as
        | { result: ActionExecuteResult; action: { id: string; name: string } }
        | { category: string; message: string };
      if (!res.ok) {
        const err = data as { category: string; message: string };
        setError({ category: err.category, message: err.message });
        setStage("error");
        return;
      }
      const ok = data as { result: ActionExecuteResult };
      setResult(ok.result);
      setStage("result");
      toast.success(`Ran ${action.label}.`);

      if (tableSchema && tableName) {
        qc.invalidateQueries({ queryKey: ["rows", connectionId, tableSchema, tableName] });
        qc.invalidateQueries({ queryKey: ["row", connectionId, tableSchema, tableName] });
        qc.invalidateQueries({ queryKey: ["rowCount", connectionId, tableSchema, tableName] });
      }
    } catch (e) {
      setError({ category: "network", message: (e as Error).message ?? "Request failed." });
      setStage("error");
    }
  }, [action.id, action.label, connectionId, primaryKey, qc, tableName, tableSchema, values]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="flex items-center gap-2">
          {action.danger ? (
            <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
          ) : action.kind === "webhook" ? (
            <Webhook className="h-4 w-4 text-accent" aria-hidden />
          ) : (
            <Zap className="h-4 w-4 text-accent" aria-hidden />
          )}
          {action.label}
        </DialogTitle>
        <DialogDescription>
          {action.description ?? (
            <>
              Runs a {action.kind === "sql" ? "SQL template" : "webhook"} on this connection.
            </>
          )}
        </DialogDescription>

        {stage === "form" && (
          <ParamForm
            params={action.params}
            values={values}
            onChange={setValues}
            onCancel={onClose}
            onNext={() => setStage(action.danger ? "confirm" : "running")}
            primaryKey={primaryKey}
            scope={action.scope}
            onNextRunsImmediately={!action.danger}
            run={run}
          />
        )}

        {stage === "confirm" && (
          <ConfirmStage
            action={action}
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            onBack={() => setStage("form")}
            onConfirm={run}
          />
        )}

        {stage === "running" && (
          <div className="flex items-center gap-2 rounded-md border hairline bg-bg-sunken/50 px-3 py-4 text-sm text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
            Running…
          </div>
        )}

        {stage === "result" && result && <ResultCard result={result} onClose={onClose} />}

        {stage === "error" && error && (
          <div className="space-y-3">
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-danger">
                <X className="h-3 w-3" aria-hidden />
                <span className="font-medium">Action failed</span>
                <span className="text-fg-muted">· {error.category}</span>
              </div>
              <p className="mt-1 text-fg-muted">{error.message}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setStage("form")}>
                Try again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ParamForm({
  params,
  values,
  onChange,
  onCancel,
  onNext,
  run,
  onNextRunsImmediately,
  primaryKey,
  scope,
}: {
  params: ActionParam[];
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  onCancel: () => void;
  onNext: () => void;
  run: () => void;
  onNextRunsImmediately: boolean;
  primaryKey?: Record<string, unknown>;
  scope: ActionSummary["scope"];
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (onNextRunsImmediately) {
          run();
        } else {
          onNext();
        }
      }}
    >
      {scope === "row" && primaryKey && (
        <div className="rounded border hairline bg-bg-sunken/40 px-2.5 py-1.5 font-mono text-[11px] text-fg-muted">
          target: {JSON.stringify(primaryKey)}
        </div>
      )}
      {params.length === 0 ? (
        <p className="text-xs text-fg-muted">No parameters. Click Run to execute.</p>
      ) : (
        <ul className="space-y-2.5">
          {params.map((p) => (
            <li key={p.name} className="space-y-1">
              <label className="block text-[11px] uppercase tracking-[0.16em] text-fg-faint">
                {p.label} {p.required && <span className="text-danger">*</span>}
                <span className="ml-1 normal-case tracking-normal font-mono text-fg-faint">
                  ({p.type})
                </span>
              </label>
              {p.type === "boolean" ? (
                <select
                  className="w-full rounded-md border hairline bg-bg px-2.5 py-1.5 text-sm"
                  value={String(values[p.name] ?? "")}
                  onChange={(e) => onChange({ ...values, [p.name]: e.target.value })}
                >
                  <option value="">-</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : p.type === "json" ? (
                <Textarea
                  rows={3}
                  value={String(values[p.name] ?? "")}
                  onChange={(e) => onChange({ ...values, [p.name]: e.target.value })}
                  placeholder={p.placeholder ?? "{ }"}
                  className="font-mono !text-xs"
                />
              ) : (
                <Input
                  type={p.type === "number" ? "number" : "text"}
                  value={String(values[p.name] ?? "")}
                  onChange={(e) => onChange({ ...values, [p.name]: e.target.value })}
                  placeholder={p.placeholder}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          <Play className="h-3 w-3" aria-hidden />
          {onNextRunsImmediately ? "Run" : "Continue"}
        </Button>
      </div>
    </form>
  );
}

function ConfirmStage({
  action,
  confirmText,
  setConfirmText,
  onBack,
  onConfirm,
}: {
  action: ActionSummary;
  confirmText: string;
  setConfirmText: (s: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const matches = confirmText.trim() === action.name;
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-danger">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          <span className="font-medium">This is a danger action.</span>
        </div>
        <p className="mt-1 text-fg-muted">
          Type the action&apos;s name to confirm: <code className="font-mono text-fg">{action.name}</code>
        </p>
      </div>
      <Input
        autoFocus
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={action.name}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={!matches}
          onClick={onConfirm}
        >
          <Play className="h-3 w-3" aria-hidden />
          Run
        </Button>
      </div>
    </div>
  );
}

function ResultCard({ result, onClose }: { result: ActionExecuteResult; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-accent">
          <Check className="h-3 w-3" aria-hidden />
          <span className="font-medium">Action complete.</span>
        </div>
      </div>

      {result.kind === "sql" && result.sql && (
        <div className="space-y-2 text-xs">
          <p className="flex items-center gap-2 text-fg-muted">
            <span className="font-mono">{result.sql.command || "OK"}</span>
            <span aria-hidden>·</span>
            <span>{result.sql.rowCount.toLocaleString()} row{result.sql.rowCount === 1 ? "" : "s"}</span>
            <span aria-hidden>·</span>
            <span>{result.sql.elapsedMs}ms</span>
          </p>
          {result.sql.columns.length > 0 && result.sql.rows.length > 0 && (
            <div className="max-h-[14rem] overflow-auto rounded border hairline">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {result.sql.columns.map((c) => (
                      <th
                        key={c.name}
                        className="truncate border-b hairline px-2 py-1 text-left font-mono text-[10px] font-normal text-fg-faint"
                        title={c.name}
                      >
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.sql.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="align-top">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="truncate border-b hairline px-2 py-1 font-mono text-fg-muted"
                          style={{ maxWidth: "12rem" }}
                          title={String(cell ?? "")}
                        >
                          {cell === null || cell === undefined ? "null" : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.sql.notices.length > 0 && (
            <details className="rounded border hairline px-2 py-1 font-mono text-[10px] text-fg-faint">
              <summary className="cursor-pointer">{result.sql.notices.length} notice(s)</summary>
              <ul className="mt-1 space-y-0.5">
                {result.sql.notices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {result.kind === "webhook" && result.webhook && (
        <div className="space-y-2 text-xs">
          <p className="flex items-center gap-2 text-fg-muted">
            <span className={cn("font-mono", result.webhook.ok ? "text-accent" : "text-danger")}>
              HTTP {result.webhook.status}
            </span>
            <span aria-hidden>·</span>
            <span>{result.webhook.elapsedMs}ms</span>
            {result.webhook.truncated && (
              <>
                <span aria-hidden>·</span>
                <span>truncated</span>
              </>
            )}
          </p>
          <pre className="max-h-[14rem] overflow-auto rounded border hairline bg-bg-sunken px-2.5 py-2 font-mono text-[11px] text-fg-muted">
            {result.webhook.body || "(empty response)"}
          </pre>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
