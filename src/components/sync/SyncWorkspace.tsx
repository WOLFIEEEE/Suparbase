"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Database, Loader2, Play, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/ui/cn";
import type {
  ConnSummary,
  ProfileJson,
  RunJson,
  SyncOptions,
  SyncPlan,
  SyncTableConfig,
} from "./api";
import {
  abortRun,
  analyze,
  createProfile,
  deleteProfile,
  listConnections,
  listProfiles,
  listRuns,
  previewPlan,
  streamRun,
  updateProfile,
} from "./api";
import type { AdvisorResponse, PrivacyTier } from "./api";
import type { TableAction } from "@/server/schema/sync";

interface Props {
  connectionId: string;
  targetName: string;
  targetHasPostgresUrl: boolean;
}

export function SyncWorkspace({ connectionId, targetName, targetHasPostgresUrl }: Props) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const connectionsQ = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const profilesQ = useQuery({
    queryKey: ["sync", connectionId, "profiles"],
    queryFn: () => listProfiles(connectionId),
  });
  const runsQ = useQuery({
    queryKey: ["sync", connectionId, "runs"],
    queryFn: () => listRuns(connectionId),
  });

  const connById = useMemo(() => {
    const m = new Map<string, ConnSummary>();
    for (const c of connectionsQ.data ?? []) m.set(c.id, c);
    return m;
  }, [connectionsQ.data]);

  const profiles = profilesQ.data?.profiles ?? [];
  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && profiles.length > 0) setSelectedId(profiles[0]!.id);
  }, [profiles, selectedId]);

  if (!targetHasPostgresUrl) {
    return (
      <Alert tone="warn">
        <strong>Direct Postgres URL required.</strong> Sync reads the catalog, truncates and loads
        tables directly — it can&apos;t run over the API. Add a Direct Postgres URL to this
        connection in its{" "}
        <a className="underline" href={`/c/${connectionId}/settings`}>
          settings
        </a>
        , and to the base connection too.
      </Alert>
    );
  }

  const baseOptions = (connectionsQ.data ?? []).filter(
    (c) => c.id !== connectionId && c.hasPostgresUrl,
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-fg">Profiles</h2>
          <Button size="sm" variant="secondary" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>
        {profiles.length === 0 ? (
          <p className="text-xs text-fg-faint">
            No sync profiles yet. Create one to choose a base connection and what to copy.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {profiles.map((p) => {
              const base = connById.get(p.baseConnectionId);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      "w-full rounded border hairline px-3 py-2 text-left transition-colors",
                      p.id === selectedId
                        ? "border-accent/50 bg-accent/10"
                        : "hover:bg-bg-raised",
                    )}
                  >
                    <div className="truncate text-sm text-fg">{p.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-faint">
                      <span className="truncate">{base?.hostname ?? "base"}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">{targetName}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="min-w-0">
        {selected ? (
          <ProfileEditor
            key={selected.id}
            connectionId={connectionId}
            targetName={targetName}
            profile={selected}
            baseConn={connById.get(selected.baseConnectionId) ?? null}
            onChanged={() => qc.invalidateQueries({ queryKey: ["sync", connectionId, "profiles"] })}
            onDeleted={() => {
              setSelectedId(null);
              qc.invalidateQueries({ queryKey: ["sync", connectionId, "profiles"] });
            }}
            onRunFinished={() => qc.invalidateQueries({ queryKey: ["sync", connectionId, "runs"] })}
            onDuplicate={async (p) => {
              try {
                const created = await createProfile(connectionId, {
                  name: `${p.name} copy`,
                  baseConnectionId: p.baseConnectionId,
                  options: p.options,
                  tableConfig: p.tableConfig,
                });
                await qc.invalidateQueries({ queryKey: ["sync", connectionId, "profiles"] });
                setSelectedId(created.id);
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        ) : (
          <div className="rounded border hairline p-8 text-center text-sm text-fg-faint">
            Select or create a profile to configure a sync.
          </div>
        )}

        <RecentRuns runs={runsQ.data?.runs ?? []} connById={connById} />
      </section>

      <NewProfileDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        baseOptions={baseOptions}
        onCreate={async (name, baseId) => {
          try {
            const created = await createProfile(connectionId, {
              name,
              baseConnectionId: baseId,
              options: { applySchema: false, allowDestructive: false, rowCap: null },
              tableConfig: { tables: {} },
            });
            await qc.invalidateQueries({ queryKey: ["sync", connectionId, "profiles"] });
            setSelectedId(created.id);
            setNewOpen(false);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RunState {
  active: boolean;
  dryRun: boolean;
  runId?: string;
  phase?: string;
  tables: Record<string, { estimatedRows?: number; rowsCopied?: number; durationMs?: number; done: boolean }>;
  warnings: string[];
  status?: string;
  error?: string;
  plan?: SyncPlan;
}

function setAction(cfg: SyncTableConfig, q: string, action: TableAction): SyncTableConfig {
  const tables = { ...cfg.tables };
  tables[q] = { ...(tables[q] ?? { action: "sync" }), action };
  return { tables };
}

function setFk(
  cfg: SyncTableConfig,
  q: string,
  col: string,
  res: { strategy: "null" | "remap"; remapTo?: string } | null,
): SyncTableConfig {
  const tables = { ...cfg.tables };
  const existing = tables[q] ?? { action: "sync" as TableAction };
  const fk = { ...(existing.fk ?? {}) };
  if (res) fk[col] = res;
  else delete fk[col];
  tables[q] = { ...existing, fk };
  return { tables };
}

type AnonStrat = "null" | "fixed" | "hash" | "email";

function setAnon(
  cfg: SyncTableConfig,
  q: string,
  col: string,
  rule: { strategy: AnonStrat; value?: string } | null,
): SyncTableConfig {
  const tables = { ...cfg.tables };
  const existing = tables[q] ?? { action: "sync" as TableAction };
  const anonymize = { ...(existing.anonymize ?? {}) };
  if (rule) anonymize[col] = rule;
  else delete anonymize[col];
  tables[q] = { ...existing, anonymize };
  return { tables };
}

interface EditorProps {
  connectionId: string;
  targetName: string;
  profile: ProfileJson;
  baseConn: ConnSummary | null;
  onChanged: () => void;
  onDeleted: () => void;
  onRunFinished: () => void;
  onDuplicate: (profile: ProfileJson) => void;
}

function ProfileEditor({
  connectionId,
  targetName,
  profile,
  baseConn,
  onChanged,
  onDeleted,
  onRunFinished,
  onDuplicate,
}: EditorProps) {
  const [name, setName] = useState(profile.name);
  const [schedule, setSchedule] = useState<number | null>(profile.scheduleIntervalHours);
  const [options, setOptions] = useState<SyncOptions>(profile.options);
  const [tableConfig, setTableConfig] = useState<SyncTableConfig>(profile.tableConfig);
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [suggestions, setSuggestions] = useState<AdvisorResponse | null>(null);
  const [tier, setTier] = useState<PrivacyTier>("schema");

  const action = (q: string): TableAction => tableConfig.tables[q]?.action ?? "sync";

  const previewMut = useMutation({
    mutationFn: () =>
      previewPlan(connectionId, {
        baseConnectionId: profile.baseConnectionId,
        options,
        tableConfig,
      }),
    onSuccess: (res) => setPlan(res.plan),
    onError: (e) => toast.error((e as Error).message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      updateProfile(connectionId, profile.id, {
        name,
        options,
        tableConfig,
        scheduleIntervalHours: schedule,
      }),
    onSuccess: () => {
      setDirty(false);
      onChanged();
      toast.success("Profile saved.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteProfile(connectionId, profile.id),
    onSuccess: onDeleted,
    onError: (e) => toast.error((e as Error).message),
  });

  const analyzeMut = useMutation({
    mutationFn: () => analyze(connectionId, { baseConnectionId: profile.baseConnectionId, tier }),
    onSuccess: (r) => {
      setSuggestions(r.suggestions);
      const n =
        r.suggestions.tableClassifications.length +
        r.suggestions.fkResolutionSuggestions.length +
        r.suggestions.inferredRelationships.length;
      toast.success(`AI returned ${n} suggestion${n === 1 ? "" : "s"}.`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function applySuggestions() {
    if (!suggestions) return;
    let cfg = tableConfig;
    for (const c of suggestions.tableClassifications) cfg = setAction(cfg, c.table, c.suggestedAction);
    for (const r of suggestions.fkResolutionSuggestions) {
      cfg = setFk(cfg, r.table, r.column, { strategy: r.strategy, remapTo: r.remapTo });
    }
    setTableConfig(cfg);
    setDirty(true);
    setSuggestions(null);
    toast.success("Applied AI suggestions — re-preview to see the plan.");
  }

  function edit(next: SyncTableConfig | SyncOptions, kind: "config" | "options") {
    setDirty(true);
    if (kind === "config") setTableConfig(next as SyncTableConfig);
    else setOptions(next as SyncOptions);
  }

  async function doRun(dryRun: boolean, confirm?: string) {
    // Runs always execute the *saved* profile, so flush any edits first.
    if (dirty) await saveMut.mutateAsync().catch(() => {});
    setRun({ active: true, dryRun, tables: {}, warnings: [] });
    try {
      await streamRun(connectionId, { profileId: profile.id, dryRun, confirm }, (e) => {
        setRun((prev) => reduceEvent(prev, e));
      });
    } catch (err) {
      setRun((prev) => ({
        ...(prev ?? { dryRun, tables: {}, warnings: [] }),
        active: false,
        status: "failed",
        error: (err as Error).message,
      }));
    } finally {
      onRunFinished();
    }
  }

  // Universe of tables = whatever the last plan reported.
  const tableUniverse = useMemo(() => {
    if (!plan) return [];
    const est = new Map<string, number>();
    for (const t of plan.tables) est.set(t.qualified, t.estimatedRows);
    const all = [...plan.tables.map((t) => t.qualified), ...plan.excluded, ...plan.skipped];
    return [...new Set(all)].sort().map((q) => ({ qualified: q, estimatedRows: est.get(q) }));
  }, [plan]);

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded border hairline p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            className="h-9 w-64"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            aria-label="Profile name"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => onDuplicate(profile)} aria-label="Duplicate profile">
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
              aria-label="Delete profile"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Database className="h-4 w-4 text-fg-faint" />
          <span className="font-mono text-fg">{baseConn?.hostname ?? profile.baseConnectionId}</span>
          <ArrowRight className="h-4 w-4 text-accent" />
          <span className="font-mono text-fg">{targetName}</span>
          <span className="text-xs text-fg-faint">(full replace)</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={schedule != null}
            onChange={(e) => {
              setSchedule(e.target.checked ? 24 : null);
              setDirty(true);
            }}
          />
          Auto-sync on a schedule
          {schedule != null && (
            <>
              <span>every</span>
              <Input
                type="number"
                min={1}
                className="h-8 w-20"
                value={schedule}
                onChange={(e) => {
                  setSchedule(Math.max(1, Number(e.target.value) || 1));
                  setDirty(true);
                }}
              />
              <span>hours (runs unattended, no confirmation)</span>
            </>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded border hairline p-4">
        <label className="space-y-1 text-xs text-fg-muted">
          <span>Row cap per table (blank = all rows)</span>
          <Input
            type="number"
            min={0}
            className="h-9 w-48"
            placeholder="all"
            value={options.rowCap ?? ""}
            onChange={(ev) => {
              const v = ev.target.value.trim();
              edit({ ...options, rowCap: v === "" ? null : Math.max(0, Number(v)) }, "options");
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={options.applySchema}
            onChange={(e) =>
              edit({ ...options, applySchema: e.target.checked, allowDestructive: e.target.checked ? options.allowDestructive : false }, "options")
            }
          />
          Apply schema changes
        </label>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={options.allowDestructive}
            disabled={!options.applySchema}
            onChange={(e) => edit({ ...options, allowDestructive: e.target.checked }, "options")}
          />
          Allow destructive (drops)
        </label>
        <Button onClick={() => previewMut.mutate()} disabled={previewMut.isPending} variant="secondary">
          {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {plan ? "Re-preview plan" : "Preview plan"}
        </Button>
        {plan && (
          <>
            <Button
              variant="outline"
              onClick={() => doRun(true)}
              disabled={run?.active}
            >
              Dry run
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirmOpen(true)}
              disabled={run?.active || plan.blocking}
            >
              <Play className="h-3.5 w-3.5" /> Run sync
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded border hairline p-4">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="text-sm text-fg">Analyze with AI</span>
        <select
          className="h-8 rounded border hairline bg-bg-sunken px-2 text-xs"
          value={tier}
          onChange={(e) => setTier(e.target.value as PrivacyTier)}
          title="What the model is allowed to see"
        >
          <option value="schema">schema only (safest)</option>
          <option value="redacted">+ value shapes (no raw data)</option>
          <option value="raw">+ raw sample rows (sends prod data)</option>
        </select>
        <Button size="sm" variant="secondary" onClick={() => analyzeMut.mutate()} disabled={analyzeMut.isPending}>
          {analyzeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Analyze
        </Button>
        <span className="text-xs text-fg-faint">
          Suggests exclusions, FK resolutions, and undeclared relationships. Advisory only.
        </span>
      </div>

      {suggestions && (
        <AdvisorPanel
          suggestions={suggestions}
          onApply={applySuggestions}
          onDismiss={() => setSuggestions(null)}
        />
      )}

      {plan && <PlanView plan={plan} action={action} universe={tableUniverse}
        onAction={(q, a) => edit(setAction(tableConfig, q, a), "config")}
        onResolve={(q, col, res) => edit(setFk(tableConfig, q, col, res), "config")}
        onAnon={(q, col, rule) => edit(setAnon(tableConfig, q, col, rule), "config")}
        tableConfig={tableConfig}
      />}

      {run && (
        <RunProgress
          run={run}
          onAbort={
            run.active && run.runId
              ? async () => {
                  try {
                    await abortRun(connectionId, run.runId!);
                    toast.message("Abort requested — finishing the current table, then rolling back.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Full-replace sync"
        description={
          <>
            This <strong>truncates and reloads</strong> every synced table on{" "}
            <strong>{targetName}</strong> from base. The base is never modified. Type the target
            name to confirm.
          </>
        }
        tone="danger"
        requireText={targetName}
        confirmLabel="Run sync"
        onConfirm={() => doRun(false, targetName)}
      />
    </div>
  );
}

function reduceEvent(prev: RunState | null, e: { event: string; data: Record<string, unknown> }): RunState {
  const base: RunState = prev ?? { active: true, dryRun: false, tables: {}, warnings: [] };
  switch (e.event) {
    case "run":
      return { ...base, active: true, dryRun: Boolean(e.data.dryRun), runId: String(e.data.id), tables: {}, warnings: [], status: undefined, error: undefined };
    case "phase":
      return { ...base, phase: String(e.data.phase) };
    case "table_start": {
      const q = String(e.data.table);
      return { ...base, tables: { ...base.tables, [q]: { ...base.tables[q], estimatedRows: Number(e.data.estimatedRows), done: false } } };
    }
    case "table_done": {
      const q = String(e.data.table);
      return {
        ...base,
        tables: {
          ...base.tables,
          [q]: { ...base.tables[q], rowsCopied: Number(e.data.rowsCopied), durationMs: Number(e.data.durationMs), done: true },
        },
      };
    }
    case "warning":
      return { ...base, warnings: [...base.warnings, String(e.data.message)] };
    case "result":
      return { ...base, active: false, status: String(e.data.status), plan: e.data.plan as SyncPlan, error: e.data.error ? String(e.data.error) : undefined };
    case "error":
      return { ...base, active: false, status: "failed", error: String(e.data.message) };
    case "done":
      return { ...base, active: false };
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------

interface PlanViewProps {
  plan: SyncPlan;
  tableConfig: SyncTableConfig;
  action: (q: string) => TableAction;
  universe: { qualified: string; estimatedRows?: number }[];
  onAction: (q: string, a: TableAction) => void;
  onResolve: (q: string, col: string, res: { strategy: "null" | "remap"; remapTo?: string } | null) => void;
  onAnon: (q: string, col: string, rule: { strategy: AnonStrat; value?: string } | null) => void;
}

function PlanView({ plan, tableConfig, action, universe, onAction, onResolve, onAnon }: PlanViewProps) {
  return (
    <div className="space-y-4">
      {plan.blocking && (
        <Alert tone="danger">
          <strong>Cannot run yet.</strong>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {plan.blockingReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Alert>
      )}
      {plan.warnings.length > 0 && (
        <Alert tone="warn">
          <ul className="list-disc space-y-0.5 pl-5">
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {plan.schemaDiff.hasChanges && (
        <div className="space-y-1 rounded border hairline p-4">
          <h3 className="text-sm font-medium text-fg">
            Schema changes ({plan.schemaDiff.summary.length})
          </h3>
          <p className="text-xs text-fg-faint">
            Applied before the data load (drops/constraints where relevant). Turn on “Apply schema
            changes” to include these in a run.
          </p>
          <p className="text-[11px] text-warn">
            Note: structural changes (CREATE/ALTER/DROP) run outside the data transaction, so unlike
            the data load they are not rolled back if a later step fails. They are idempotent on
            re-run.
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {plan.schemaDiff.summary.slice(0, 50).map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="rounded border hairline px-1 py-0 text-[10px] text-fg-faint">{s.kind}</span>
                <code className="text-fg-muted">{s.detail}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.unresolvedRisks.length > 0 && (
        <div className="space-y-2 rounded border border-warn/40 p-4">
          <h3 className="text-sm font-medium text-fg">Foreign keys needing resolution</h3>
          <p className="text-xs text-fg-faint">
            These synced tables reference rows that won&apos;t exist on the target (excluded or
            unsynced tables, e.g. users). Choose what to write into each column.
          </p>
          {plan.unresolvedRisks.map((risk) =>
            risk.columns.map((col) => {
              const res = tableConfig.tables[risk.table]?.fk?.[col] ?? null;
              return (
                <div key={`${risk.table}.${col}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <code className="text-fg">{risk.table}.{col}</code>
                  <span className="text-xs text-fg-faint">→ {risk.refTable}</span>
                  <select
                    className="h-8 rounded border hairline bg-bg-sunken px-2 text-xs"
                    value={res?.strategy ?? ""}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      if (!v) onResolve(risk.table, col, null);
                      else if (v === "null") onResolve(risk.table, col, { strategy: "null" });
                      else onResolve(risk.table, col, { strategy: "remap", remapTo: res?.remapTo ?? "" });
                    }}
                  >
                    <option value="">choose…</option>
                    <option value="null">set NULL</option>
                    <option value="remap">remap to value</option>
                  </select>
                  {res?.strategy === "remap" && (
                    <Input
                      className="h-8 w-56"
                      placeholder="target value (e.g. a staging user id)"
                      value={res.remapTo ?? ""}
                      onChange={(ev) => onResolve(risk.table, col, { strategy: "remap", remapTo: ev.target.value })}
                    />
                  )}
                </div>
              );
            }),
          )}
        </div>
      )}

      <div className="rounded border hairline">
        <div className="flex items-center justify-between border-b hairline px-4 py-2 text-xs text-fg-faint">
          <span>{universe.length} tables · copy order parents-first</span>
          <span>{plan.order.length} syncing</span>
        </div>
        <ul className="divide-y divide-line/60">
          {universe.map((t) => {
            const a = action(t.qualified);
            return (
              <li key={t.qualified} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="truncate font-mono text-fg">{t.qualified}</span>
                <div className="flex items-center gap-3">
                  {a === "sync" && t.estimatedRows != null && (
                    <span className="text-xs tabular-nums text-fg-faint">
                      ~{t.estimatedRows.toLocaleString()} rows
                    </span>
                  )}
                  <select
                    className="h-8 rounded border hairline bg-bg-sunken px-2 text-xs"
                    value={a}
                    onChange={(ev) => onAction(t.qualified, ev.target.value as TableAction)}
                  >
                    <option value="sync">sync</option>
                    <option value="exclude">exclude (keep target&apos;s)</option>
                    <option value="skip">skip</option>
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <details className="rounded border hairline">
        <summary className="cursor-pointer px-4 py-2 text-sm text-fg">
          Anonymize columns
          <span className="ml-2 text-xs text-fg-faint">
            mask values as they&apos;re copied (e.g. emails on a synced users table)
          </span>
        </summary>
        <div className="space-y-3 border-t hairline p-4">
          {plan.tables.map((t) => (
            <div key={t.qualified}>
              <p className="font-mono text-xs text-fg-muted">{t.qualified}</p>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {t.columns.map((col) => {
                  const rule = tableConfig.tables[t.qualified]?.anonymize?.[col] ?? null;
                  return (
                    <div key={col} className="flex items-center gap-2 text-xs">
                      <span className="w-32 truncate text-fg">{col}</span>
                      <select
                        className="h-7 rounded border hairline bg-bg-sunken px-1 text-xs"
                        value={rule?.strategy ?? ""}
                        onChange={(ev) => {
                          const v = ev.target.value as AnonStrat | "";
                          if (!v) onAnon(t.qualified, col, null);
                          else onAnon(t.qualified, col, { strategy: v, value: rule?.value });
                        }}
                      >
                        <option value="">keep</option>
                        <option value="null">null</option>
                        <option value="hash">hash</option>
                        <option value="email">email</option>
                        <option value="fixed">fixed</option>
                      </select>
                      {rule?.strategy === "fixed" && (
                        <Input
                          className="h-7 w-28"
                          placeholder="value"
                          value={rule.value ?? ""}
                          onChange={(ev) =>
                            onAnon(t.qualified, col, { strategy: "fixed", value: ev.target.value })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AdvisorPanel({
  suggestions,
  onApply,
  onDismiss,
}: {
  suggestions: AdvisorResponse;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { tableClassifications, fkResolutionSuggestions, inferredRelationships, notes } = suggestions;
  return (
    <div className="space-y-3 rounded border border-accent/40 bg-accent/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
          <Sparkles className="h-4 w-4 text-accent" /> AI suggestions
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button size="sm" onClick={onApply}>
            Apply all
          </Button>
        </div>
      </div>

      {tableClassifications.length > 0 && (
        <div>
          <p className="text-xs font-medium text-fg-muted">Table classifications</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {tableClassifications.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <code className="text-fg">{c.table}</code>
                <Badge>{c.kind}</Badge>
                <span className="text-accent">→ {c.suggestedAction}</span>
                {c.rationale && <span className="text-fg-faint">{c.rationale}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fkResolutionSuggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-fg-muted">FK resolutions</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {fkResolutionSuggestions.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <code className="text-fg">{r.table}.{r.column}</code>
                <span className="text-accent">{r.strategy}{r.remapTo ? ` → ${r.remapTo}` : ""}</span>
                {r.rationale && <span className="text-fg-faint">{r.rationale}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {inferredRelationships.length > 0 && (
        <div>
          <p className="text-xs font-medium text-fg-muted">Inferred relationships (undeclared)</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {inferredRelationships.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <code className="text-fg-muted">
                  {r.childTable}.{r.childColumns.join(",")} → {r.refTable}.{r.refColumns.join(",")}
                </code>
                <span className="text-fg-faint">conf {Math.round(r.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-fg-faint">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunProgress({ run, onAbort }: { run: RunState; onAbort?: () => void }) {
  const tables = Object.entries(run.tables);
  return (
    <div className="space-y-3 rounded border hairline p-4">
      <div className="flex items-center gap-2 text-sm">
        {run.active && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
        <span className="font-medium text-fg">
          {run.dryRun ? "Dry run" : "Sync"} {run.active ? `· ${run.phase ?? "starting"}…` : `· ${run.status ?? "done"}`}
        </span>
        {onAbort && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onAbort}>
            Abort
          </Button>
        )}
      </div>
      {run.error && <Alert tone="danger">{run.error}</Alert>}
      {tables.length > 0 && (
        <ul className="space-y-1 text-xs">
          {tables.map(([q, t]) => (
            <li key={q} className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-fg-muted">{q}</span>
              <span className="tabular-nums text-fg-faint">
                {t.done
                  ? `${(t.rowsCopied ?? 0).toLocaleString()} rows · ${t.durationMs ?? 0}ms`
                  : "copying…"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {run.warnings.length > 0 && (
        <Alert tone="warn">
          <ul className="list-disc space-y-0.5 pl-5">
            {run.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
      {!run.active && run.status === "succeeded" && !run.dryRun && (
        <p className="text-xs text-accent">Target now mirrors base for all synced tables.</p>
      )}
      {!run.active && run.dryRun && run.status === "succeeded" && (
        <p className="text-xs text-fg-faint">Dry run only — nothing was written to the target.</p>
      )}
    </div>
  );
}

function RecentRuns({ runs, connById }: { runs: RunJson[]; connById: Map<string, ConnSummary> }) {
  if (runs.length === 0) return null;
  return (
    <div className="mt-8 space-y-2">
      <h2 className="text-sm font-medium text-fg">Recent runs</h2>
      <ul className="divide-y divide-line/60 rounded border hairline">
        {runs.map((r) => {
          const rows = r.stats?.tables?.reduce((n, t) => n + (t.rowsCopied ?? 0), 0) ?? 0;
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
              <div className="flex items-center gap-2">
                <RunBadge status={r.status} />
                {r.dryRun && <Badge>dry</Badge>}
                <span className="font-mono text-fg-muted">
                  {connById.get(r.baseConnectionId)?.hostname ?? "base"}
                </span>
              </div>
              <div className="flex items-center gap-4 text-fg-faint">
                <span className="tabular-nums">{rows.toLocaleString()} rows</span>
                <span>{new Date(r.startedAt).toLocaleString()}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RunBadge({ status }: { status: string }) {
  const tone =
    status === "succeeded"
      ? "border-accent/40 text-accent"
      : status === "failed"
      ? "border-danger/40 text-danger"
      : status === "running"
      ? "border-line text-fg-muted"
      : "border-warn/40 text-warn";
  return <span className={cn("rounded border px-1.5 py-0.5", tone)}>{status}</span>;
}

// ---------------------------------------------------------------------------

function NewProfileDialog({
  open,
  onOpenChange,
  baseOptions,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  baseOptions: ConnSummary[];
  onCreate: (name: string, baseId: string) => void;
}) {
  const [name, setName] = useState("");
  const [baseId, setBaseId] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setBaseId(baseOptions[0]?.id ?? "");
    }
  }, [open, baseOptions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New sync profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <label className="block space-y-1 text-xs text-fg-muted">
            <span>Profile name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prod → staging" />
          </label>
          <label className="block space-y-1 text-xs text-fg-muted">
            <span>Base connection (read-only source)</span>
            {baseOptions.length === 0 ? (
              <p className="text-xs text-warn">
                No eligible base connections. A base needs a Direct Postgres URL and must differ
                from this one.
              </p>
            ) : (
              <select
                className="h-10 w-full rounded border hairline bg-bg-sunken px-3 text-sm"
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
              >
                {baseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.hostname})
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !baseId}
            onClick={() => onCreate(name.trim(), baseId)}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
