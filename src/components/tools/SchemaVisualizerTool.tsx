"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, KeyRound, Link2 } from "lucide-react";
import { parseDdl } from "@/lib/tools/ddl";
import { ErdDiagram, downloadSvg } from "./ErdDiagram";

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

export function SchemaVisualizerTool() {
  const [ddl, setDdl] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const parsed = useMemo(() => parseDdl(ddl.trim() || EXAMPLE), [ddl]);

  const usingExample = !ddl.trim();

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
              {usingExample ? "Showing an example. Paste your own DDL above." : `${parsed.tables.length} tables · ${parsed.edges.length} relationships`}
            </span>
            <button
              type="button"
              onClick={() => svgRef.current && downloadSvg(svgRef.current, "schema-erd.svg")}
              className="inline-flex items-center gap-1 rounded border hairline px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
            >
              <Download className="h-3 w-3" aria-hidden /> Download SVG
            </button>
          </div>
          <div className="overflow-auto rounded-md border hairline bg-bg-sunken">
            <ErdDiagram ref={svgRef} parsed={parsed} />
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
