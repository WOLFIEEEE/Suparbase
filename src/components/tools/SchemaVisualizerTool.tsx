"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, KeyRound, Link2 } from "lucide-react";
import { parseDdl, type ParsedTable } from "@/lib/tools/ddl";

const EXAMPLE = `create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz default now()
);
create table public.orders (
  id uuid primary key,
  user_id uuid not null references users(id),
  amount numeric(10,2),
  status text default 'pending'
);`;

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
  const colY = new Array(cols).fill(MARGIN);
  tables.forEach((t, i) => {
    const col = i % cols;
    const h = HEADER_H + t.columns.length * ROW_H + PAD;
    const x = MARGIN + col * COL_W;
    const y = colY[col];
    const rowY = new Map<string, number>();
    t.columns.forEach((c, ci) => rowY.set(c.name, y + HEADER_H + ci * ROW_H + ROW_H / 2));
    boxes.set(t.name, { table: t, x, y, w: BOX_W, h, rowY });
    colY[col] = y + h + GAP;
  });
  const width = MARGIN * 2 + cols * COL_W - (COL_W - BOX_W);
  const height = Math.max(...colY, MARGIN) + MARGIN;
  return { boxes, width, height };
}

export function SchemaVisualizerTool() {
  const [ddl, setDdl] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const parsed = useMemo(() => parseDdl(ddl.trim() || EXAMPLE), [ddl]);
  const { boxes, width, height } = useMemo(() => layout(parsed.tables), [parsed]);

  const usingExample = !ddl.trim();

  function downloadSvg() {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schema-erd.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto]">
        <textarea
          value={ddl}
          onChange={(e) => setDdl(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={`Paste Postgres DDL (CREATE TABLE …) or a pg_dump. Runs in your browser.\n\n${EXAMPLE}`}
          aria-label="SQL DDL to visualize"
          className="block w-full resize-y rounded-md border hairline bg-bg-sunken px-4 py-3 font-mono text-xs leading-relaxed focus:border-line-strong focus:outline-none"
        />
      </div>

      {parsed.warnings.length > 0 && (
        <ul className="space-y-1">
          {parsed.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}

      {parsed.tables.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-faint">
              {usingExample ? "Showing an example — paste your own DDL above." : `${parsed.tables.length} tables · ${parsed.edges.length} relationships`}
            </span>
            <button
              type="button"
              onClick={downloadSvg}
              className="inline-flex items-center gap-1 rounded border hairline px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
            >
              <Download className="h-3 w-3" aria-hidden /> Download SVG
            </button>
          </div>
          <div className="overflow-auto rounded-md border hairline bg-bg-sunken">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              width={width}
              height={height}
              style={{ maxWidth: "none" }}
              role="img"
              aria-label="Entity-relationship diagram"
            >
              <defs>
                <marker id="erd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
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
                    markerEnd="url(#erd-arrow)"
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
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-fg-faint">
            <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" aria-hidden /> primary key</span>
            <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3 text-accent" aria-hidden /> foreign key</span>
          </div>
        </div>
      )}
    </div>
  );
}
