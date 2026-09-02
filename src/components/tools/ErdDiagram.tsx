"use client";

import { forwardRef, useMemo } from "react";
import type { ParsedSchema, ParsedTable } from "@/lib/tools/ddl";

/**
 * Entity-relationship SVG shared by the free `/tools/schema-visualizer`
 * page and the workspace Schema → ERD tab. Pure layout: three columns of
 * table boxes, FK edges drawn as curves under the boxes. Theme-aware via
 * CSS variables so it matches whichever surface embeds it.
 */

const COL_W = 300;
const BOX_W = 240;
const HEADER_H = 30;
const ROW_H = 20;
const PAD = 10;
const GAP = 40;
const MARGIN = 24;
const COLS = 3;

interface Box {
  table: ParsedTable;
  x: number;
  y: number;
  w: number;
  h: number;
  rowY: Map<string, number>;
}

function layout(tables: ParsedTable[]) {
  const boxes = new Map<string, Box>();
  const cols = Math.min(COLS, Math.max(1, tables.length));
  const colY = new Array<number>(cols).fill(MARGIN);
  tables.forEach((t, i) => {
    const col = i % cols;
    const h = HEADER_H + t.columns.length * ROW_H + PAD;
    const x = MARGIN + col * COL_W;
    const y = colY[col]!;
    const rowY = new Map<string, number>();
    t.columns.forEach((c, ci) => rowY.set(c.name, y + HEADER_H + ci * ROW_H + ROW_H / 2));
    boxes.set(t.name, { table: t, x, y, w: BOX_W, h, rowY });
    colY[col] = y + h + GAP;
  });
  const width = MARGIN * 2 + cols * COL_W - (COL_W - BOX_W);
  const height = Math.max(...colY, MARGIN) + MARGIN;
  return { boxes, width, height };
}

/** Serialise the rendered SVG and trigger a browser download. */
export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  parsed: ParsedSchema;
  /** Marker id prefix, unique per diagram on a page. */
  markerId?: string;
}

export const ErdDiagram = forwardRef<SVGSVGElement, Props>(function ErdDiagram(
  { parsed, markerId = "erd-arrow" },
  ref,
) {
  const { boxes, width, height } = useMemo(() => layout(parsed.tables), [parsed]);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ maxWidth: "none" }}
      role="img"
      aria-label="Entity-relationship diagram"
    >
      <defs>
        <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="rgb(var(--accent))" />
        </marker>
      </defs>

      {/* Edges first (under boxes) */}
      {parsed.edges.map((e, i) => {
        const from = boxes.get(e.from);
        const to = boxes.get(e.to);
        if (!from || !to) return null;
        const y1 = from.rowY.get(e.fromColumn) ?? from.y + from.h / 2;
        const fromRight = from.x + from.w;
        const x1 = from.x + from.w / 2 > to.x + to.w / 2 ? from.x : fromRight;
        const x2 = to.x + to.w / 2 > from.x + from.w / 2 ? to.x : to.x + to.w;
        const y2 = to.y + HEADER_H / 2;
        const mx = (x1 + x2) / 2;
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="rgb(var(--accent) / 0.5)"
            strokeWidth={1.5}
            markerEnd={`url(#${markerId})`}
          />
        );
      })}

      {/* Table boxes */}
      {[...boxes.values()].map((b) => (
        <g key={b.table.name}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} fill="rgb(var(--bg-raised))" stroke="rgb(var(--line-strong))" />
          <rect x={b.x} y={b.y} width={b.w} height={HEADER_H} rx={8} fill="rgb(var(--accent) / 0.12)" />
          <text x={b.x + PAD} y={b.y + HEADER_H / 2 + 4} fontFamily="var(--font-mono, monospace)" fontSize={12} fontWeight={600} fill="rgb(var(--fg))">
            {b.table.name}
          </text>
          {b.table.columns.map((c, ci) => {
            const cy = b.y + HEADER_H + ci * ROW_H;
            return (
              <g key={c.name}>
                {c.isPrimaryKey && (
                  <text x={b.x + PAD} y={cy + ROW_H / 2 + 3.5} fontSize={9} fill="rgb(var(--accent))">🔑</text>
                )}
                <text
                  x={b.x + PAD + (c.isPrimaryKey ? 14 : 0)}
                  y={cy + ROW_H / 2 + 3.5}
                  fontFamily="var(--font-mono, monospace)"
                  fontSize={10.5}
                  fill={c.references ? "rgb(var(--accent))" : "rgb(var(--fg-muted))"}
                >
                  {c.name}
                </text>
                <text x={b.x + b.w - PAD} y={cy + ROW_H / 2 + 3.5} textAnchor="end" fontFamily="var(--font-mono, monospace)" fontSize={9} fill="rgb(var(--fg-faint))">
                  {c.type}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
});
