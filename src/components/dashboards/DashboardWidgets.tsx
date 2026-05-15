"use client";

/**
 * Widget grid + per-widget runner for the connection dashboard.
 * Each widget fires its own POST .../run query and renders the chart
 * primitive matching its `type`. The Edit page (`/c/[id]/dashboard/edit`)
 * handles CRUD; this surface is read-only.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  LineChart as LineIcon,
  List,
  Loader2,
  Pencil,
  RefreshCw,
  Sigma,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { WidgetRunResult, WidgetSummary } from "@/lib/dashboards/types";
import { BarChart, DataList, KpiTile, LineChart } from "./charts";

interface Props {
  connectionId: string;
}

async function fetchWidgets(connectionId: string): Promise<WidgetSummary[]> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/widgets`);
  if (!res.ok) throw new AppError("server", "Failed to load widgets.");
  const j = (await res.json()) as { widgets: WidgetSummary[] };
  return j.widgets;
}

export function DashboardWidgets({ connectionId }: Props) {
  const { data: widgets = [], isLoading } = useQuery({
    queryKey: ["widgets", connectionId],
    queryFn: () => fetchWidgets(connectionId),
    staleTime: 30_000,
  });

  if (isLoading) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
          Dashboard widgets
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/c/${connectionId}/dashboard/edit`}>
            <Pencil className="h-3 w-3" aria-hidden />
            {widgets.length === 0 ? "Add widgets" : "Edit dashboard"}
          </Link>
        </Button>
      </header>

      {widgets.length === 0 ? (
        <EmptyWidgets connectionId={connectionId} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {widgets.map((w) => (
            <WidgetCard key={w.id} connectionId={connectionId} widget={w} />
          ))}
        </div>
      )}
    </section>
  );
}

function spanClass(span: WidgetSummary["span"]): string {
  if (span === "full") return "md:col-span-2 xl:col-span-3";
  if (span === "2") return "md:col-span-2 xl:col-span-2";
  return "";
}

function widgetIcon(type: WidgetSummary["type"]) {
  if (type === "kpi") return <Sigma className="h-3 w-3 text-accent" aria-hidden />;
  if (type === "bar") return <BarChart3 className="h-3 w-3 text-accent" aria-hidden />;
  if (type === "line") return <LineIcon className="h-3 w-3 text-accent" aria-hidden />;
  return <List className="h-3 w-3 text-accent" aria-hidden />;
}

function WidgetCard({
  connectionId,
  widget,
}: {
  connectionId: string;
  widget: WidgetSummary;
}) {
  const qc = useQueryClient();
  const { data, isFetching, error } = useQuery({
    queryKey: ["widget-run", connectionId, widget.id, widget.updatedAt],
    queryFn: async (): Promise<WidgetRunResult> => {
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/widgets/${encodeURIComponent(widget.id)}/run`,
        { method: "POST" },
      );
      const text = await res.text();
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!res.ok) {
        throw new AppError(
          (json.category as AppError["category"] | undefined) ?? "server",
          (json.message as string | undefined) ?? `HTTP ${res.status}`,
        );
      }
      return json as unknown as WidgetRunResult;
    },
    staleTime: widget.refreshSec > 0 ? widget.refreshSec * 1000 : 30_000,
    refetchInterval: widget.refreshSec > 0 ? widget.refreshSec * 1000 : false,
    retry: 0,
  });

  return (
    <article
      className={cn(
        "group relative flex min-h-[200px] flex-col gap-2 rounded-lg border hairline bg-bg-raised p-3",
        spanClass(widget.span),
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {widgetIcon(widget.type)}
            <h3 className="truncate font-display text-sm">{widget.title}</h3>
          </div>
          {widget.description && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-fg-faint">
              {widget.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            qc.invalidateQueries({
              queryKey: ["widget-run", connectionId, widget.id, widget.updatedAt],
            })
          }
          className="rounded p-1 text-fg-faint opacity-0 transition-opacity hover:bg-bg-sunken hover:text-fg group-hover:opacity-100"
          aria-label="Refresh widget"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {error ? (
          <div className="flex items-start gap-1.5 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>{error instanceof Error ? error.message : "Failed."}</span>
          </div>
        ) : !data ? (
          <div className="flex h-full items-center justify-center text-[11px] text-fg-faint">
            <Loader2 className="h-3 w-3 animate-spin text-accent" aria-hidden />
          </div>
        ) : widget.type === "kpi" ? (
          <KpiTile
            columns={data.columns}
            rows={data.rows}
            format={widget.visConfig.format}
            unit={widget.visConfig.unit}
            prefix={widget.visConfig.prefix}
            valueColumn={widget.visConfig.valueColumn}
          />
        ) : widget.type === "bar" ? (
          <BarChart
            columns={data.columns}
            rows={data.rows}
            labelColumn={widget.visConfig.labelColumn}
            valueColumn={widget.visConfig.valueColumn}
          />
        ) : widget.type === "line" ? (
          <LineChart
            columns={data.columns}
            rows={data.rows}
            labelColumn={widget.visConfig.labelColumn}
            valueColumn={widget.visConfig.valueColumn}
          />
        ) : (
          <DataList columns={data.columns} rows={data.rows} visibleColumns={widget.visConfig.columns} />
        )}
      </div>

      {data && (
        <footer className="flex items-center justify-between text-[10px] text-fg-faint">
          <span>{data.rowCount.toLocaleString()} row{data.rowCount === 1 ? "" : "s"}</span>
          <span className="font-mono">{data.elapsedMs}ms</span>
        </footer>
      )}
    </article>
  );
}

function EmptyWidgets({ connectionId }: { connectionId: string }) {
  return (
    <div className="rounded-lg border hairline bg-bg-raised px-6 py-8 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent/10">
        <BarChart3 className="h-4 w-4 text-accent" aria-hidden />
      </div>
      <h3 className="mt-3 font-display text-base">No widgets yet</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
        Pin SQL queries as charts and KPI tiles so this dashboard shows
        the numbers your team actually checks every morning.
      </p>
      <Button asChild className="mt-4" size="sm">
        <Link href={`/c/${connectionId}/dashboard/edit`}>
          <Pencil className="h-3 w-3" aria-hidden />
          Create your first widget
        </Link>
      </Button>
    </div>
  );
}
