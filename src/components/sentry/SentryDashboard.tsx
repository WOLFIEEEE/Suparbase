"use client";

/**
 * Sentry — security watchdog UI.
 *
 * Three sections:
 *   1. Header card: last-scan timestamp, total findings by severity, "Scan now" button.
 *   2. Findings list grouped by severity, with per-finding actions
 *      (quarantine / acknowledge / mark resolved).
 *   3. Recent scans collapsible: the last 10 scans with duration + finding count.
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  Lock,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppError } from "@/lib/errors";
import { relativeFromNow } from "@/lib/ui/time";
import { cn } from "@/lib/ui/cn";
import type {
  FindingSeverity,
  FindingSummary,
  ScanRunResult,
  ScanSummary,
} from "@/lib/sentry/types";

interface Props {
  connectionId: string;
}

type ConnectionRole = "owner" | "editor" | "viewer";

interface SentryData {
  findings: FindingSummary[];
  scans: ScanSummary[];
  canQuarantine: boolean;
  myRole: ConnectionRole;
}

function canMutate(role: ConnectionRole | undefined): boolean {
  return role === "owner" || role === "editor";
}

async function fetchSentry(connectionId: string): Promise<SentryData> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/sentry`);
  if (!res.ok) throw new AppError("server", "Failed to load Sentry data.");
  return (await res.json()) as SentryData;
}

async function triggerScan(connectionId: string): Promise<ScanRunResult> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/sentry/scan`, {
    method: "POST",
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new AppError(
      (json.category as AppError["category"] | undefined) ?? "server",
      (json.message as string | undefined) ?? "Scan failed.",
    );
  }
  return json as unknown as ScanRunResult;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 0, warn: 1, info: 2 };

export function SentryDashboard({ connectionId }: Props) {
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sentry", connectionId],
    queryFn: () => fetchSentry(connectionId),
    refetchInterval: 30_000,
  });

  const openFindings = useMemo(
    () => (data?.findings ?? []).filter((f) => f.status === "open" || f.status === "quarantined"),
    [data?.findings],
  );
  const acknowledgedFindings = useMemo(
    () => (data?.findings ?? []).filter((f) => f.status === "acknowledged" || f.status === "resolved"),
    [data?.findings],
  );

  const counts = useMemo(() => {
    const c = { critical: 0, warn: 0, info: 0, quarantined: 0 };
    for (const f of openFindings) {
      if (f.status === "quarantined") c.quarantined += 1;
      else c[f.severity] += 1;
    }
    return c;
  }, [openFindings]);

  const onScan = useCallback(async () => {
    setScanning(true);
    try {
      const result = await triggerScan(connectionId);
      toast.success(
        result.findings === 0
          ? `Scanned ${result.tablesScanned.length} tables. No findings.`
          : `Found ${result.findings} issue${result.findings === 1 ? "" : "s"} across ${result.tablesScanned.length} tables.`,
      );
      qc.invalidateQueries({ queryKey: ["sentry", connectionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }, [connectionId, qc]);

  const onAction = useCallback(
    async (finding: FindingSummary, action: "ack" | "resolve" | "quarantine" | "dismiss") => {
      try {
        if (action === "ack" || action === "resolve") {
          const res = await fetch(
            `/api/connections/${encodeURIComponent(connectionId)}/sentry/findings/${encodeURIComponent(finding.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: action === "ack" ? "acknowledged" : "resolved" }),
            },
          );
          if (!res.ok) throw new AppError("server", await safeMsg(res));
        } else if (action === "quarantine") {
          const res = await fetch(
            `/api/connections/${encodeURIComponent(connectionId)}/sentry/findings/${encodeURIComponent(finding.id)}/quarantine`,
            { method: "POST" },
          );
          if (!res.ok) throw new AppError("server", await safeMsg(res));
        } else if (action === "dismiss") {
          const res = await fetch(
            `/api/connections/${encodeURIComponent(connectionId)}/sentry/findings/${encodeURIComponent(finding.id)}/quarantine`,
            { method: "DELETE" },
          );
          if (!res.ok) throw new AppError("server", await safeMsg(res));
        }
        toast.success("Updated.");
        qc.invalidateQueries({ queryKey: ["sentry", connectionId] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed.");
      }
    },
    [connectionId, qc],
  );

  const lastScan = data?.scans[0];

  return (
    <div className="space-y-6">
      <Hero
        counts={counts}
        lastScan={lastScan}
        scanning={scanning}
        onScan={onScan}
        canQuarantine={data?.canQuarantine ?? false}
      />

      {isLoading ? (
        <div className="rounded-md border hairline bg-bg-raised px-4 py-6 text-sm text-fg-muted">
          Loading…
        </div>
      ) : openFindings.length === 0 ? (
        <AllClear lastScan={lastScan} onScan={onScan} scanning={scanning} />
      ) : (
        <section className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            Open findings · {openFindings.length}
          </h3>
          <ul className="space-y-2">
            {openFindings
              .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
              .map((f) => (
                <FindingRow
                  key={f.id}
                  connectionId={connectionId}
                  finding={f}
                  canQuarantine={data?.canQuarantine ?? false}
                  canMutate={canMutate(data?.myRole)}
                  onAction={onAction}
                />
              ))}
          </ul>
        </section>
      )}

      {acknowledgedFindings.length > 0 && (
        <ArchivedSection findings={acknowledgedFindings} />
      )}

      <ScansSection scans={data?.scans ?? []} />
    </div>
  );
}

async function safeMsg(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string };
    return j.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({
  counts,
  lastScan,
  scanning,
  onScan,
  canQuarantine,
}: {
  counts: { critical: number; warn: number; info: number; quarantined: number };
  lastScan?: ScanSummary;
  scanning: boolean;
  onScan: () => void;
  canQuarantine: boolean;
}) {
  const status =
    counts.critical > 0
      ? "critical"
      : counts.warn > 0
      ? "warn"
      : counts.quarantined > 0
      ? "quarantined"
      : "ok";

  return (
    <section
      className={cn(
        "surface relative overflow-hidden rounded-lg",
        status === "critical" && "border-danger/40",
        status === "warn" && "border-warn/40",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b",
          status === "critical"
            ? "from-danger/15"
            : status === "warn"
            ? "from-warn/15"
            : "from-accent/10",
          "to-transparent",
        )}
      />
      <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {status === "critical" ? (
              <ShieldAlert className="h-4 w-4 text-danger" aria-hidden />
            ) : status === "warn" ? (
              <ShieldAlert className="h-4 w-4 text-warn" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
            )}
            <h2 className="font-display text-2xl leading-tight">
              {status === "critical"
                ? "Critical findings"
                : status === "warn"
                ? "Things to review"
                : status === "quarantined"
                ? "Quarantined tables in effect"
                : "All clear"}
            </h2>
          </div>
          <p className="max-w-prose text-sm text-fg-muted">
            Sentry probes your project with the anon REST key and reads{" "}
            <code className="font-mono text-xs">pg_policies</code> to catch
            RLS drift before it leaks. If a table starts returning rows to anon
            that shouldn&apos;t, you&apos;ll see it here — and you can
            one-click quarantine it.
          </p>
          {!canQuarantine && (
            <p className="inline-flex max-w-prose items-start gap-1.5 rounded border hairline bg-bg-sunken/40 px-2.5 py-1.5 text-[11px] text-fg-faint">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>
                Quarantine + pg_policies inspection need the{" "}
                <Link href={`./settings`} className="text-accent hover:underline">
                  Direct Postgres URL
                </Link>
                . Without it, Sentry runs anon-probe only.
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button onClick={onScan} disabled={scanning}>
            {scanning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Scanning…
              </>
            ) : (
              <>
                <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                Scan now
              </>
            )}
          </Button>
          <p className="flex items-center gap-1 text-[11px] text-fg-faint">
            <Clock className="h-3 w-3" aria-hidden />
            {lastScan?.completedAt
              ? `last scan ${relativeFromNow(lastScan.completedAt)}`
              : lastScan
              ? "scanning…"
              : "never"}
          </p>
        </div>
      </div>
      <div className="relative grid grid-cols-2 gap-x-4 gap-y-1.5 border-t hairline px-6 py-3 text-xs sm:grid-cols-4">
        <Counter label="critical" value={counts.critical} tone="danger" />
        <Counter label="warn" value={counts.warn} tone="warn" />
        <Counter label="info" value={counts.info} tone="muted" />
        <Counter label="quarantined" value={counts.quarantined} tone="accent" />
      </div>
    </section>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warn" | "accent" | "muted";
}) {
  const colour =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
      ? "text-warn"
      : tone === "accent"
      ? "text-accent"
      : "text-fg-muted";
  return (
    <div className="space-y-0.5">
      <div className={cn("font-display text-2xl tabular-nums", colour)}>
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

function FindingRow({
  connectionId,
  finding,
  canQuarantine,
  canMutate: canMutateRow,
  onAction,
}: {
  connectionId: string;
  finding: FindingSummary;
  canQuarantine: boolean;
  canMutate: boolean;
  onAction: (f: FindingSummary, a: "ack" | "resolve" | "quarantine" | "dismiss") => void;
}) {
  const tone =
    finding.severity === "critical"
      ? "danger"
      : finding.severity === "warn"
      ? "warn"
      : "muted";
  const quarantined = finding.status === "quarantined";

  return (
    <li
      className={cn(
        "rounded-md border bg-bg-raised p-3 transition-colors",
        tone === "danger" ? "border-danger/40" : tone === "warn" ? "border-warn/40" : "hairline",
        quarantined && "ring-1 ring-accent/30",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-sunken">
          {kindIcon(finding)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">
              {finding.kind.replace(/_/g, " ")}
            </span>
            <Badge tone={tone === "muted" ? undefined : tone}>{finding.severity}</Badge>
            {quarantined && (
              <Badge tone="accent">
                <span className="inline-flex items-center gap-0.5">
                  <Lock className="h-2.5 w-2.5" aria-hidden /> quarantined
                </span>
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            {finding.tableName && (
              <Link
                href={`/c/${connectionId}/tables/${encodeURIComponent(finding.tableName)}`}
                className="font-mono text-sm text-fg hover:text-accent"
              >
                {finding.schemaName}.{finding.tableName}
              </Link>
            )}
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            {finding.details.message ?? defaultMessage(finding)}
          </p>
          {finding.details.matchedColumns && finding.details.matchedColumns.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-fg-faint">PII columns:</span>
              {finding.details.matchedColumns.map((c) => (
                <code
                  key={c}
                  className="rounded surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg"
                >
                  {c}
                </code>
              ))}
            </p>
          )}
          {finding.details.policyDefinition && (
            <pre className="mt-1.5 overflow-x-auto rounded border hairline bg-bg-sunken px-2 py-1.5 font-mono text-[11px]">
              {finding.details.policyDefinition}
            </pre>
          )}
          <p className="mt-1 text-[10px] text-fg-faint">
            first seen {relativeFromNow(finding.firstSeenAt)} · last seen {relativeFromNow(finding.lastSeenAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {!canMutateRow ? (
            <span className="rounded-full border hairline bg-bg-sunken/40 px-2 py-0.5 text-[10px] text-fg-faint">
              viewer · read only
            </span>
          ) : quarantined ? (
            <Button size="sm" variant="ghost" onClick={() => onAction(finding, "dismiss")}>
              <Undo2 className="h-3 w-3" aria-hidden /> Lift quarantine
            </Button>
          ) : (
            <>
              {(finding.severity === "critical" || finding.severity === "warn") && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onAction(finding, "quarantine")}
                  disabled={!canQuarantine}
                  title={
                    canQuarantine
                      ? "Apply a deny-all RLS policy and block anon access until you fix the underlying issue."
                      : "Needs the Direct Postgres URL."
                  }
                >
                  <Lock className="h-3 w-3" aria-hidden />
                  Quarantine
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onAction(finding, "ack")}>
                <Eye className="h-3 w-3" aria-hidden />
                Acknowledge
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onAction(finding, "resolve")}>
                <Check className="h-3 w-3" aria-hidden />
                Resolve
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function kindIcon(f: FindingSummary) {
  const tone =
    f.severity === "critical"
      ? "text-danger"
      : f.severity === "warn"
      ? "text-warn"
      : "text-fg-muted";
  if (f.kind === "anon_read_pii")
    return <AlertTriangle className={cn("h-3.5 w-3.5", tone)} aria-hidden />;
  if (f.kind === "rls_disabled")
    return <ShieldAlert className={cn("h-3.5 w-3.5", tone)} aria-hidden />;
  if (f.kind === "policy_overly_permissive")
    return <AlertTriangle className={cn("h-3.5 w-3.5", tone)} aria-hidden />;
  if (f.kind === "scan_error")
    return <X className="h-3.5 w-3.5 text-fg-faint" aria-hidden />;
  return <Sparkles className={cn("h-3.5 w-3.5", tone)} aria-hidden />;
}

function defaultMessage(f: FindingSummary): string {
  switch (f.kind) {
    case "anon_read":
      return "Anon REST returned rows from this table.";
    case "anon_read_pii":
      return "Anon REST returned rows containing PII-flavoured columns.";
    case "rls_disabled":
      return "Row-Level Security is off for this table.";
    case "policy_overly_permissive":
      return "Policy uses USING (true) — every authed user can read every row.";
    default:
      return "Sentry finding.";
  }
}

function AllClear({
  lastScan,
  onScan,
  scanning,
}: {
  lastScan?: ScanSummary;
  onScan: () => void;
  scanning: boolean;
}) {
  return (
    <div className="rounded-md border hairline bg-bg-raised px-6 py-10 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/10">
        <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
      </div>
      <h3 className="mt-3 font-display text-base">No open findings</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
        {lastScan
          ? `Last probe ${relativeFromNow(lastScan.completedAt ?? lastScan.startedAt)} found nothing. Run another scan whenever you push schema changes.`
          : "Run a scan to baseline this project's exposure right now."}
      </p>
      <Button className="mt-4" size="sm" onClick={onScan} disabled={scanning}>
        {scanning ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Scanning…
          </>
        ) : (
          <>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Scan now
          </>
        )}
      </Button>
    </div>
  );
}

function ArchivedSection({ findings }: { findings: FindingSummary[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint hover:text-fg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
        Acknowledged · {findings.length}
      </button>
      {open && (
        <ul className="space-y-1.5">
          {findings.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-2 rounded-md border hairline bg-bg-raised px-3 py-2 text-[11px] text-fg-muted opacity-80"
            >
              <span className="font-mono">{f.kind.replace(/_/g, " ")}</span>
              <span className="font-mono text-fg-faint">
                {f.schemaName}.{f.tableName ?? "?"}
              </span>
              <span className="text-fg-faint">
                {f.status === "resolved" ? "resolved" : "ack"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScansSection({ scans }: { scans: ScanSummary[] }) {
  const [open, setOpen] = useState(false);
  if (scans.length === 0) return null;
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint hover:text-fg"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
        Scan history · {scans.length}
      </button>
      {open && (
        <ul className="space-y-1 rounded-md border hairline bg-bg-raised p-2 text-[11px]">
          {scans.map((s) => {
            const ms =
              s.completedAt
                ? new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()
                : null;
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 border-b hairline px-1 py-1.5 last:border-b-0"
              >
                <span className="font-mono text-fg-faint">
                  {new Date(s.startedAt).toLocaleString()}
                </span>
                <span className="text-fg-muted">
                  {s.tablesScanned.length} table{s.tablesScanned.length === 1 ? "" : "s"}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    s.findingsCount > 0 ? "text-danger" : "text-accent",
                  )}
                >
                  {s.findingsCount} finding{s.findingsCount === 1 ? "" : "s"}
                </span>
                {ms != null && <span className="ml-auto font-mono text-fg-faint">{ms}ms</span>}
                {s.error && (
                  <span className="font-mono text-danger" title={s.error}>
                    error
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
