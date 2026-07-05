"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { generateTypes, type TypeTarget } from "@/lib/tools/types-gen";
import { cn } from "@/lib/ui/cn";

const EXAMPLE = `create table public.profiles (
  id uuid primary key references auth.users(id),
  username text not null,
  bio text,
  followers int not null default 0,
  is_verified boolean not null default false,
  settings jsonb,
  created_at timestamptz not null default now()
);`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded border hairline px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
    >
      {copied ? <Check className="h-3 w-3 text-accent" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function TypeGenTool() {
  const [ddl, setDdl] = useState("");
  const [target, setTarget] = useState<TypeTarget>("typescript");
  const result = useMemo(() => generateTypes({ ddl: ddl.trim() || EXAMPLE, target }), [ddl, target]);
  const usingExample = !ddl.trim();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-fg-faint">Postgres DDL</span>
            <span className="text-[11px] text-fg-faint">
              {usingExample ? "example shown" : `${result.tableCount} tables`}
            </span>
          </div>
          <textarea
            value={ddl}
            onChange={(e) => setDdl(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder={`Paste CREATE TABLE statements. Runs in your browser.\n\n${EXAMPLE}`}
            aria-label="SQL DDL to convert"
            className="block w-full resize-y rounded-md border hairline bg-bg-sunken px-4 py-3 font-mono text-xs leading-relaxed focus:border-line-strong focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded border hairline text-xs">
              {(["typescript", "zod"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTarget(t)}
                  className={cn(
                    "px-3 py-1",
                    target === t ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-bg-sunken",
                  )}
                >
                  {t === "typescript" ? "TypeScript" : "Zod"}
                </button>
              ))}
            </div>
            <CopyButton text={result.code} />
          </div>
          <pre className="h-[26rem] overflow-auto rounded-md border hairline bg-bg-sunken p-4 font-mono text-xs leading-relaxed text-fg">
            {result.code || "No tables parsed yet."}
          </pre>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <ul className="space-y-1">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
