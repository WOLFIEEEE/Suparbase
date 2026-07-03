"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, CircleSlash, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

interface Health {
  rest: { ok: boolean; status: number | null; latencyMs: number | null; error: string | null };
  postgres: {
    configured: boolean;
    ok: boolean | null;
    latencyMs: number | null;
    error: string | null;
  };
  sentry: { lastScanAt: string | null; openCritical: number };
  checkedAt: string;
}

function scanAgeLabel(iso: string | null): string {
  if (!iso) return "never run";
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "under an hour ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Live health strip for one connection: REST reachability with the stored
 * key, Direct Postgres reachability, and Sentry scan staleness. Runs once
 * on mount; the refresh button re-probes on demand.
 */
export function ConnectionHealthCard({ connectionId }: { connectionId: string }) {
  const { data, isFetching, refetch } = useQuery<Health>({
    queryKey: ["connection-health", connectionId],
    queryFn: async () => {
      const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/health`);
      if (!res.ok) throw new Error("Health check failed");
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });

  return (
    <section className="surface space-y-4 rounded-md p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            <Activity className="h-3 w-3" aria-hidden /> Health
          </h2>
          <p className="text-xs text-fg-muted">
            Live reachability of this project with the stored credentials.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} aria-hidden />
          {isFetching ? "Checking…" : "Re-check"}
        </Button>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HealthItem
          label="PostgREST API"
          state={!data ? "pending" : data.rest.ok ? "ok" : "fail"}
          detail={
            !data
              ? "Checking…"
              : data.rest.ok
                ? `Reachable · ${data.rest.latencyMs}ms`
                : (data.rest.error ?? "Unreachable")
          }
        />
        <HealthItem
          label="Direct Postgres"
          state={
            !data
              ? "pending"
              : !data.postgres.configured
                ? "unset"
                : data.postgres.ok
                  ? "ok"
                  : "fail"
          }
          detail={
            !data
              ? "Checking…"
              : !data.postgres.configured
                ? "Not configured — SQL, RLS, undo and sync are locked."
                : data.postgres.ok
                  ? `Connected · ${data.postgres.latencyMs}ms`
                  : (data.postgres.error ?? "Connection failed")
          }
        />
        <HealthItem
          label="Sentry scan"
          state={
            !data
              ? "pending"
              : data.sentry.openCritical > 0
                ? "fail"
                : data.sentry.lastScanAt
                  ? "ok"
                  : "unset"
          }
          detail={
            !data
              ? "Checking…"
              : data.sentry.openCritical > 0
                ? `${data.sentry.openCritical} open critical finding${data.sentry.openCritical === 1 ? "" : "s"}`
                : `Last scan ${scanAgeLabel(data.sentry.lastScanAt)}`
          }
        />
      </ul>
    </section>
  );
}

function HealthItem({
  label,
  state,
  detail,
}: {
  label: string;
  state: "ok" | "fail" | "unset" | "pending";
  detail: string;
}) {
  const Icon =
    state === "ok" ? CheckCircle2 : state === "fail" ? XCircle : CircleSlash;
  return (
    <li className="rounded-lg border hairline bg-bg-raised p-4">
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            state === "ok" && "text-accent",
            state === "fail" && "text-danger",
            (state === "unset" || state === "pending") && "text-fg-faint",
          )}
          aria-hidden
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-1.5 break-words text-xs leading-relaxed text-fg-muted">{detail}</p>
    </li>
  );
}
