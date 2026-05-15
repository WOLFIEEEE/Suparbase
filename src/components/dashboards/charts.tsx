"use client";

/**
 * Hand-written SVG chart primitives. Intentionally tiny — these are used
 * inside small widget cards (~280x180) so the cost of pulling in a chart
 * library would dwarf the actual rendering. Renders the data we care
 * about (top-N bars, area+line series, KPI tile) and nothing else.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

interface NumericSeries {
  label: string;
  value: number;
}

function pickColumns(
  columns: Array<{ name: string }>,
  preferLabel?: string,
  preferValue?: string,
): { labelIdx: number; valueIdx: number } {
  const names = columns.map((c) => c.name);
  let labelIdx = preferLabel ? names.indexOf(preferLabel) : 0;
  let valueIdx = preferValue ? names.indexOf(preferValue) : -1;
  if (labelIdx < 0) labelIdx = 0;
  if (valueIdx < 0) {
    valueIdx = names.findIndex((_, i) => i !== labelIdx);
    if (valueIdx < 0) valueIdx = columns.length - 1;
  }
  return { labelIdx, valueIdx };
}

function toSeries(
  columns: Array<{ name: string }>,
  rows: unknown[][],
  preferLabel?: string,
  preferValue?: string,
): NumericSeries[] {
  if (rows.length === 0 || columns.length === 0) return [];
  const { labelIdx, valueIdx } = pickColumns(columns, preferLabel, preferValue);
  return rows
    .map((r) => {
      const v = r[valueIdx];
      const n = typeof v === "number" ? v : Number(v);
      return {
        label: String(r[labelIdx] ?? ""),
        value: Number.isFinite(n) ? n : 0,
      };
    })
    .filter((s) => s.label !== "");
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

export function KpiTile({
  columns,
  rows,
  format,
  unit,
  prefix,
  valueColumn,
}: {
  columns: Array<{ name: string }>;
  rows: unknown[][];
  format?: "number" | "currency" | "percent";
  unit?: string;
  prefix?: string;
  valueColumn?: string;
}) {
  const valueIdx = valueColumn
    ? Math.max(0, columns.findIndex((c) => c.name === valueColumn))
    : 0;
  const raw = rows[0]?.[valueIdx];
  const value = typeof raw === "number" ? raw : Number(raw);
  const ok = Number.isFinite(value);

  const previousIdx = columns.findIndex((c) => c.name === "previous");
  const prev = previousIdx >= 0 ? (() => {
    const v = rows[0]?.[previousIdx];
    return typeof v === "number" ? v : Number(v);
  })() : null;
  const delta =
    prev != null && Number.isFinite(prev) && prev !== 0
      ? ((value - prev) / prev) * 100
      : null;

  return (
    <div className="flex h-full flex-col justify-between gap-2 p-1">
      <div className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
        {format ?? "number"}
      </div>
      <div className="flex items-baseline gap-1">
        {prefix && <span className="font-display text-2xl text-fg-faint">{prefix}</span>}
        <span className="font-display text-4xl leading-none">
          {ok ? formatValue(value, format) : "—"}
        </span>
        {unit && <span className="text-sm text-fg-muted">{unit}</span>}
      </div>
      {delta != null && Number.isFinite(delta) && (
        <div
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono",
            delta >= 0
              ? "bg-accent/10 text-accent"
              : "bg-danger/10 text-danger",
          )}
        >
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          <span className="text-fg-faint">vs prev</span>
        </div>
      )}
    </div>
  );
}

function formatValue(v: number, format?: "number" | "currency" | "percent"): string {
  if (format === "currency") {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(v);
  }
  if (format === "percent") {
    return `${(v * 100).toFixed(1)}%`;
  }
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString();
}

// ---------------------------------------------------------------------------
// Horizontal bar chart (top-N)
// ---------------------------------------------------------------------------

export function BarChart({
  columns,
  rows,
  labelColumn,
  valueColumn,
}: {
  columns: Array<{ name: string }>;
  rows: unknown[][];
  labelColumn?: string;
  valueColumn?: string;
}) {
  const data = toSeries(columns, rows, labelColumn, valueColumn).slice(0, 8);
  if (data.length === 0) return <EmptyChart />;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="flex flex-col gap-1.5 p-1">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <li key={i} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate text-fg-muted" title={d.label}>
              {d.label}
            </span>
            <div className="h-3 rounded-sm bg-bg-sunken">
              <div
                className="h-full rounded-sm bg-accent"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            </div>
            <span className="font-mono tabular-nums text-fg">
              {d.value.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Line / area chart
// ---------------------------------------------------------------------------

export function LineChart({
  columns,
  rows,
  labelColumn,
  valueColumn,
}: {
  columns: Array<{ name: string }>;
  rows: unknown[][];
  labelColumn?: string;
  valueColumn?: string;
}) {
  const data = toSeries(columns, rows, labelColumn, valueColumn);
  if (data.length === 0) return <EmptyChart />;

  const W = 320;
  const H = 120;
  const PAD = 4;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: PAD + i * stepX,
    y: H - PAD - (d.value / max) * (H - PAD * 2),
  }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area =
    `M${points[0].x},${H - PAD} ` +
    points.map((p) => `L${p.x},${p.y}`).join(" ") +
    ` L${points[points.length - 1].x},${H - PAD} Z`;

  return (
    <div className="space-y-1 p-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[120px] w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="line-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#line-area)" />
        <path d={path} stroke="rgb(var(--accent))" strokeWidth="1.5" fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="rgb(var(--accent))" />
        ))}
      </svg>
      <div className="flex items-center justify-between font-mono text-[10px] text-fg-faint">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small data list
// ---------------------------------------------------------------------------

export function DataList({
  columns,
  rows,
  visibleColumns,
}: {
  columns: Array<{ name: string }>;
  rows: unknown[][];
  visibleColumns?: string[];
}) {
  if (rows.length === 0) return <EmptyChart />;
  const visible =
    visibleColumns && visibleColumns.length > 0
      ? visibleColumns
          .map((n) => columns.findIndex((c) => c.name === n))
          .filter((i) => i >= 0)
      : columns.map((_, i) => i).slice(0, 6);

  return (
    <div className="max-h-[180px] overflow-y-auto rounded border hairline">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-bg-raised">
          <tr>
            {visible.map((idx) => (
              <th
                key={idx}
                className="truncate border-b hairline px-2 py-1 text-left font-mono text-[10px] font-normal text-fg-faint"
              >
                {columns[idx].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {visible.map((idx) => (
                <td
                  key={idx}
                  className="truncate border-b hairline px-2 py-1 font-mono text-fg-muted"
                  style={{ maxWidth: "10rem" }}
                  title={String(row[idx] ?? "")}
                >
                  {row[idx] === null || row[idx] === undefined ? "null" : String(row[idx])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyChart(): ReactNode {
  return (
    <div className="grid h-full place-items-center py-4 text-[11px] text-fg-faint">
      no data
    </div>
  );
}
