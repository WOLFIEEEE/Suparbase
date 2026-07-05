"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  generateRlsPolicies,
  explainPolicy,
  PATTERN_META,
  type RlsPattern,
} from "@/lib/tools/rls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/ui/cn";

const PATTERNS = Object.keys(PATTERN_META) as RlsPattern[];

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

export function RlsGeneratorTool() {
  const [mode, setMode] = useState<"generate" | "explain">("generate");

  // Generate mode
  const [table, setTable] = useState("orders");
  const [schema, setSchema] = useState("public");
  const [pattern, setPattern] = useState<RlsPattern>("owner");
  const [ownerColumn, setOwnerColumn] = useState("user_id");
  const generated = useMemo(() => {
    try {
      return generateRlsPolicies({ table, schema, pattern, ownerColumn });
    } catch {
      return "";
    }
  }, [table, schema, pattern, ownerColumn]);

  // Explain mode
  const [policyText, setPolicyText] = useState(
    `CREATE POLICY "orders_read_own" ON orders\n  FOR SELECT TO authenticated\n  USING (user_id = auth.uid());`,
  );
  const explanation = useMemo(
    () => (policyText.trim() ? explainPolicy(policyText) : null),
    [policyText],
  );

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded border hairline text-sm">
        {(["generate", "explain"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "px-4 py-1.5 capitalize",
              mode === m ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-bg-sunken",
            )}
          >
            {m === "generate" ? "Generate policies" : "Explain a policy"}
          </button>
        ))}
      </div>

      {mode === "generate" ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rls-schema">Schema</Label>
                <Input id="rls-schema" value={schema} onChange={(e) => setSchema(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rls-table">Table</Label>
                <Input id="rls-table" value={table} onChange={(e) => setTable(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Access pattern</Label>
              <div className="space-y-1.5">
                {PATTERNS.map((p) => (
                  <label
                    key={p}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm",
                      pattern === p ? "border-accent/50 bg-accent/5" : "border hairline hover:bg-bg-sunken",
                    )}
                  >
                    <input
                      type="radio"
                      name="rls-pattern"
                      checked={pattern === p}
                      onChange={() => setPattern(p)}
                      className="mt-0.5 accent-[rgb(var(--accent))]"
                    />
                    <span>
                      <span className="font-medium">{PATTERN_META[p].label}</span>
                      <span className="mt-0.5 block text-xs text-fg-muted">{PATTERN_META[p].description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {PATTERN_META[pattern].needsOwnerColumn && (
              <div className="space-y-1.5">
                <Label htmlFor="rls-owner">Owner column (matched against auth.uid())</Label>
                <Input id="rls-owner" value={ownerColumn} onChange={(e) => setOwnerColumn(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Generated SQL</Label>
              <CopyButton text={generated} />
            </div>
            <pre className="max-h-[28rem] overflow-auto rounded-md border hairline bg-bg-sunken p-4 font-mono text-xs leading-relaxed text-fg">
              {generated}
            </pre>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rls-policy">Paste a CREATE POLICY statement</Label>
            <textarea
              id="rls-policy"
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
              rows={6}
              spellCheck={false}
              className="block w-full resize-y rounded-md border hairline bg-bg-sunken px-4 py-3 font-mono text-xs leading-relaxed focus:border-line-strong focus:outline-none"
            />
          </div>
          {explanation && (
            <div
              className={cn(
                "rounded-md border p-4 text-sm",
                explanation.ok ? "border-accent/40 bg-accent/5" : "border-warn/40 bg-warn/5 text-warn",
              )}
            >
              <p className="leading-relaxed">{explanation.summary}</p>
              {explanation.ok && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-muted sm:grid-cols-4">
                  <Meta label="Command" value={explanation.command} />
                  <Meta label="Roles" value={explanation.roles.join(", ") || "public"} />
                  <Meta label="USING" value={explanation.using ?? "—"} />
                  <Meta label="WITH CHECK" value={explanation.withCheck ?? "—"} />
                </dl>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-fg-faint">{label}</dt>
      <dd className="truncate font-mono text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}
