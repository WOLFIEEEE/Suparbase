"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  History,
  Lock,
  Play,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/lib/ui/use-confirm";
import { cn } from "@/lib/ui/cn";

interface SqlColumn {
  name: string;
  typeOid: number;
}

interface SqlResult {
  columns: SqlColumn[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
  command: string;
  notices: string[];
  readOnly: boolean;
}

interface ServerError {
  category: string;
  message: string;
  detail?: string;
  position?: number;
  hint?: string;
}

const TIMEOUT_OPTIONS = [
  { value: 1_000, label: "1s" },
  { value: 5_000, label: "5s" },
  { value: 15_000, label: "15s" },
  { value: 30_000, label: "30s" },
  { value: 60_000, label: "60s" },
];

const HISTORY_KEY_PREFIX = "suparbase.sql.history.";
const HISTORY_MAX = 30;

const STARTER = `-- ⌘/Ctrl + Enter to run.\nSELECT now();`;

const PG_TYPE_NAMES: Record<number, string> = {
  16: "bool",
  20: "int8",
  21: "int2",
  23: "int4",
  25: "text",
  26: "oid",
  114: "json",
  700: "float4",
  701: "float8",
  1042: "char",
  1043: "varchar",
  1082: "date",
  1083: "time",
  1114: "timestamp",
  1184: "timestamptz",
  1700: "numeric",
  2950: "uuid",
  3802: "jsonb",
};

function typeName(oid: number): string {
  return PG_TYPE_NAMES[oid] ?? `oid:${oid}`;
}

// ---------------------------------------------------------------------------
// History helpers (localStorage)
// ---------------------------------------------------------------------------

interface HistoryEntry {
  sql: string;
  at: number;
  readOnly: boolean;
  rowCount?: number;
  elapsedMs?: number;
}

function loadHistory(connectionId: string): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY_PREFIX + connectionId);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(connectionId: string, entries: HistoryEntry[]): void {
  try {
    window.localStorage.setItem(
      HISTORY_KEY_PREFIX + connectionId,
      JSON.stringify(entries.slice(0, HISTORY_MAX)),
    );
  } catch {
    /* quota / private-mode → ignore */
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SqlPlayground({ connectionId }: { connectionId: string }) {
  const [sql, setSql] = useState(STARTER);
  const [readOnly, setReadOnly] = useState(true);
  const [timeoutMs, setTimeoutMs] = useState(5_000);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [error, setError] = useState<ServerError | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(loadHistory(connectionId));
  }, [connectionId]);

  const mutation = useMutation<SqlResult, ServerError, void>({
    mutationFn: () =>
      new Promise<SqlResult>((resolve, reject) => {
        abortRef.current = new AbortController();
        fetch(`/api/v/${encodeURIComponent(connectionId)}/sql/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sql,
            readOnly,
            statementTimeoutMs: timeoutMs,
          }),
          signal: abortRef.current.signal,
        })
          .then(async (res) => {
            const text = await res.text();
            const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
            if (!res.ok) {
              reject(data as unknown as ServerError);
              return;
            }
            resolve(data as unknown as SqlResult);
          })
          .catch((e) => {
            if ((e as Error).name === "AbortError") {
              reject({ category: "validation", message: "Cancelled." });
              return;
            }
            reject({ category: "network", message: (e as Error).message });
          });
      }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      const next: HistoryEntry[] = [
        { sql, at: Date.now(), readOnly, rowCount: r.rowCount, elapsedMs: r.elapsedMs },
        ...history.filter((h) => h.sql.trim() !== sql.trim()),
      ];
      setHistory(next);
      saveHistory(connectionId, next);
    },
    onError: (e: ServerError) => {
      setResult(null);
      setError(e);
    },
  });

  const run = useCallback(() => {
    if (!sql.trim() || mutation.isPending) return;
    setError(null);
    mutation.mutate();
  }, [sql, mutation]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runExplain = useCallback(() => {
    if (!sql.trim() || mutation.isPending) return;
    const trimmed = sql.trim().replace(/;$/, "");
    setSql(`EXPLAIN ANALYZE ${trimmed}`);
    setTimeout(() => mutation.mutate(), 0);
  }, [sql, mutation]);

  // Keyboard: ⌘/Ctrl + Enter → run.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        if (document.activeElement?.tagName === "TEXTAREA") {
          e.preventDefault();
          run();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  return (
    <div className="space-y-4">
      <SafetyBanner readOnly={readOnly} />

      <section className="surface rounded-md">
        <div className="flex flex-wrap items-center gap-2 border-b hairline px-3 py-2">
          <ModeToggle readOnly={readOnly} onChange={setReadOnly} />
          <TimeoutSelect value={timeoutMs} onChange={setTimeoutMs} />
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={runExplain} disabled={mutation.isPending}>
              <Eye className="h-3 w-3" aria-hidden /> EXPLAIN
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
            >
              <History className="h-3 w-3" aria-hidden /> Recent
              <ChevronDown className={cn("h-3 w-3 transition-transform", historyOpen && "rotate-180")} aria-hidden />
            </Button>
            {mutation.isPending ? (
              <Button size="sm" variant="secondary" onClick={cancel}>
                <Square className="h-3 w-3" aria-hidden /> Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={run} disabled={!sql.trim()}>
                <Play className="h-3 w-3" aria-hidden /> Run
                <span className="hidden text-[10px] opacity-70 sm:inline">
                  ⌘↵
                </span>
              </Button>
            )}
          </div>
        </div>

        {historyOpen && (
          <HistoryPanel
            history={history}
            onPick={(h) => {
              setSql(h.sql);
              setHistoryOpen(false);
              textareaRef.current?.focus();
            }}
            onClear={() => {
              setHistory([]);
              saveHistory(connectionId, []);
            }}
          />
        )}

        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            // Tab inserts spaces instead of moving focus
            if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget;
              const start = t.selectionStart;
              const end = t.selectionEnd;
              const next = sql.slice(0, start) + "  " + sql.slice(end);
              setSql(next);
              requestAnimationFrame(() => {
                t.selectionStart = t.selectionEnd = start + 2;
              });
            }
          }}
          rows={10}
          className={cn(
            "block w-full resize-y rounded-b-md border-0 bg-bg-sunken px-4 py-3 font-mono text-sm leading-relaxed",
            "focus:outline-none",
          )}
          spellCheck={false}
          aria-label="SQL editor"
        />
      </section>

      {error && <ErrorPanel error={error} />}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SafetyBanner({ readOnly }: { readOnly: boolean }) {
  if (readOnly) {
    return (
      <div className="flex items-center gap-2 rounded border border-accent/40 bg-accent/5 px-3 py-2 text-[11px] text-fg-muted">
        <Lock className="h-3 w-3 shrink-0 text-accent" aria-hidden />
        <span>
          <strong className="text-fg">Read-only mode</strong>: runs your SQL inside
          a transaction with <code className="font-mono">SET TRANSACTION READ ONLY</code>
          {" "}and rolls it back afterwards. Any INSERT/UPDATE/DELETE will be rejected
          by Postgres.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
      <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden />
      <span>
        <strong>Write mode is ON.</strong> Any SQL you run can do whatever your
        stored Postgres role can do: including <code className="font-mono">DROP TABLE</code>
        ,{" "}
        <code className="font-mono">DELETE</code>, and{" "}
        <code className="font-mono">TRUNCATE</code>. Each write run is recorded in the
        audit log.
      </span>
    </div>
  );
}

function ModeToggle({
  readOnly,
  onChange,
}: {
  readOnly: boolean;
  onChange: (next: boolean) => void;
}) {
  const confirmWrite = useConfirm();
  return (
    <>
      <div className="inline-flex items-center rounded border hairline text-[11px]">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1",
            readOnly ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-bg-sunken",
          )}
        >
          <Lock className="h-3 w-3" aria-hidden /> Read-only
        </button>
        <button
          type="button"
          onClick={() => confirmWrite.ask(() => onChange(false))}
          className={cn(
            "inline-flex items-center gap-1 border-l hairline px-2 py-1",
            !readOnly ? "bg-danger/10 text-danger" : "text-fg-muted hover:bg-bg-sunken",
          )}
        >
          <Unlock className="h-3 w-3" aria-hidden /> Write
        </button>
      </div>
      <ConfirmDialog
        {...confirmWrite.dialogProps}
        title="Turn on write mode?"
        description="Any SQL you run can INSERT, UPDATE, DELETE, or DROP. Make sure you know what your query does before you press Run."
        confirmLabel="I understand - enable writes"
        tone="danger"
      />
    </>
  );
}

function TimeoutSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
      <Clock className="h-3 w-3" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border hairline bg-bg-raised px-1.5 py-0.5 text-[11px]"
      >
        {TIMEOUT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function HistoryPanel({
  history,
  onPick,
  onClear,
}: {
  history: HistoryEntry[];
  onPick: (h: HistoryEntry) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return (
      <p className="border-b hairline px-3 py-3 text-[11px] text-fg-faint">
        No recent queries yet: anything you run from here is saved locally to
        this browser.
      </p>
    );
  }
  return (
    <div className="border-b hairline">
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-fg-faint">
        <span>Recent ({history.length})</span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-0.5 hover:text-fg"
        >
          <Trash2 className="h-2.5 w-2.5" aria-hidden /> clear
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {history.map((h, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onPick(h)}
              className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[11px] text-fg-muted hover:bg-bg-sunken hover:text-fg"
            >
              <span
                className={cn(
                  "shrink-0",
                  h.readOnly ? "text-accent" : "text-danger",
                )}
              >
                {h.readOnly ? <Lock className="h-2.5 w-2.5" aria-hidden /> : <Unlock className="h-2.5 w-2.5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono">{h.sql.replace(/\s+/g, " ")}</span>
              {h.rowCount != null && (
                <span className="shrink-0 text-fg-faint">{h.rowCount} rows</span>
              )}
              {h.elapsedMs != null && (
                <span className="shrink-0 text-fg-faint">{h.elapsedMs}ms</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultPanel({ result }: { result: SqlResult }) {
  if (result.columns.length === 0 && result.rowCount === 0) {
    return (
      <section className="surface rounded-md p-4 text-xs text-fg-muted">
        <p>
          <Sparkles className="-mt-0.5 mr-1 inline h-3 w-3 text-accent" aria-hidden />
          {result.command || "OK"} · no rows · {result.elapsedMs}ms
        </p>
        <NoticeList notices={result.notices} />
      </section>
    );
  }
  return (
    <section className="surface rounded-md">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b hairline px-3 py-2 text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-2">
          <Badge tone={result.readOnly ? "accent" : "warn"}>
            {result.readOnly ? "read-only" : "write"}
          </Badge>
          <span className="font-mono">{result.command || "OK"}</span>
          <span>
            {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? "" : "s"}
            {result.truncated && (
              <span className="ml-1 text-warn">· truncated to {result.rows.length}</span>
            )}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden /> {result.elapsedMs.toLocaleString()}ms
        </span>
      </header>
      <NoticeList notices={result.notices} inset />
      <ResultTable result={result} />
    </section>
  );
}

function NoticeList({ notices, inset }: { notices: string[]; inset?: boolean }) {
  if (notices.length === 0) return null;
  return (
    <ul
      className={cn(
        "space-y-1 border-b hairline bg-warn/5 px-3 py-2 text-[11px] text-warn",
        inset && "border-b-0",
      )}
    >
      {notices.map((n, i) => (
        <li key={i} className="font-mono">{n}</li>
      ))}
    </ul>
  );
}

function ResultTable({ result }: { result: SqlResult }) {
  if (result.rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-fg-muted">
        Query returned no rows.
      </p>
    );
  }
  return (
    <div className="max-h-[24rem] overflow-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-bg-raised">
          <tr>
            <th className="border-b hairline px-2 py-1.5 text-right font-mono text-[10px] text-fg-faint">#</th>
            {result.columns.map((c, i) => (
              <th
                key={i}
                className="border-b hairline px-2 py-1.5 text-left font-mono"
                style={{ minWidth: "6rem" }}
                title={`OID ${c.typeOid}`}
              >
                <div className="text-fg">{c.name}</div>
                <div className="text-[9px] text-fg-faint">{typeName(c.typeOid)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-bg-sunken/40">
              <td className="border-b hairline px-2 py-1 text-right font-mono text-[10px] text-fg-faint tabular-nums">
                {ri + 1}
              </td>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border-b hairline px-2 py-1 align-top font-mono"
                  style={{ maxWidth: "20rem" }}
                >
                  <Cell value={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value === null) {
    return <span className="italic text-fg-faint">null</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-accent" : "text-fg-muted"}>{String(value)}</span>
    );
  }
  if (typeof value === "number") {
    return <span className="tabular-nums text-fg">{value.toLocaleString()}</span>;
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return <span className="italic text-fg-faint">empty</span>;
  if (text.length <= 80) {
    return <span className="whitespace-pre-wrap break-words text-fg">{text}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="block w-full text-left text-fg hover:text-accent"
    >
      {open ? (
        <span className="flex items-start gap-1">
          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className="whitespace-pre-wrap break-words">{text}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{text.slice(0, 80)}…</span>
        </span>
      )}
    </button>
  );
}

function ErrorPanel({ error }: { error: ServerError }) {
  return (
    <section
      className={cn(
        "space-y-2 rounded-md border px-4 py-3 text-xs",
        error.category === "validation" || error.category === "rls"
          ? "border-warn/40 bg-warn/5 text-warn"
          : "border-danger/40 bg-danger/10 text-danger",
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {error.category.toUpperCase()} ·{" "}
            <span className="font-mono">{error.message}</span>
          </p>
          {error.detail && (
            <p className="font-mono text-[11px] opacity-90">{error.detail}</p>
          )}
          {error.hint && (
            <p className="font-mono text-[11px] opacity-80">hint: {error.hint}</p>
          )}
          {error.position != null && (
            <p className="font-mono text-[10px] opacity-70">at position {error.position}</p>
          )}
        </div>
      </div>
    </section>
  );
}

