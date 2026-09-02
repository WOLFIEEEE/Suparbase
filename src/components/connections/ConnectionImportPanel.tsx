"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseConnectionImport, type ImportCandidate, MAX_IMPORT_ROWS } from "@/lib/connections/import-parse";
import { ENVIRONMENT_META } from "@/lib/ui/environment";
import { cn } from "@/lib/ui/cn";

type RowStatus =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; id: string }
  | { state: "failed"; message: string; upgrade?: boolean };

const EXAMPLE = `[
  { "name": "my-app prod", "url": "https://abcdefgh.supabase.co", "key": "eyJ…", "environment": "production" },
  { "name": "my-app staging", "url": "https://stuvwxyz.supabase.co", "key": "eyJ…", "postgresUrl": "postgresql://…" }
]`;

/**
 * Bulk-add connections from pasted JSON or CSV. Parsing is local; each
 * valid row is then POSTed to the normal create endpoint one at a time so
 * plan caps, credential probes, and name collisions behave exactly as the
 * single-connection form.
 */
export function ConnectionImportPanel() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [statuses, setStatuses] = useState<Record<number, RowStatus>>({});
  const [running, setRunning] = useState(false);
  const parsed = useMemo(() => parseConnectionImport(text), [text]);
  const valid = parsed.candidates.filter((c) => c.problems.length === 0);
  const doneCount = Object.values(statuses).filter((s) => s.state === "done").length;

  async function importRow(c: ImportCandidate): Promise<RowStatus> {
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: c.name,
        url: c.url,
        key: c.key,
        postgresUrl: c.postgresUrl,
        environment: c.environment,
      }),
    });
    const json = (await res.json().catch(() => null)) as { id?: string; message?: string; category?: string } | null;
    if (res.ok && json?.id) return { state: "done", id: json.id };
    return { state: "failed", message: json?.message ?? `Failed (${res.status}).`, upgrade: json?.category === "plan_limit" };
  }

  async function runImport() {
    setRunning(true);
    for (const c of valid) {
      const current = statuses[c.index];
      if (current?.state === "done") continue;
      setStatuses((s) => ({ ...s, [c.index]: { state: "running" } }));
      const result = await importRow(c);
      setStatuses((s) => ({ ...s, [c.index]: result }));
      if (result.state === "failed" && result.upgrade) break;
    }
    setRunning(false);
    void qc.invalidateQueries({ queryKey: ["connections"] });
  }

  return (
    <div className="space-y-6">
      <section className="surface space-y-3 rounded-md p-6">
        <label htmlFor="import-text" className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
          Paste JSON or CSV
        </label>
        <textarea
          id="import-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatuses({});
          }}
          rows={10}
          spellCheck={false}
          placeholder={EXAMPLE}
          className="block w-full resize-y rounded-md border hairline bg-bg-sunken px-4 py-3 font-mono text-xs leading-relaxed focus:border-line-strong focus:outline-none"
        />
        <p className="text-xs text-fg-faint">
          Columns: <code className="font-mono">name, url, key, postgresUrl, environment</code>. Up to {MAX_IMPORT_ROWS} rows per import. Keys are
          sent straight to the create endpoint and encrypted at rest; nothing is stored until you press Import.
        </p>
        {parsed.error && (
          <p className="flex items-center gap-2 text-xs text-danger">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {parsed.error}
          </p>
        )}
      </section>

      {parsed.candidates.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">
              {valid.length} of {parsed.candidates.length} rows ready
              {doneCount > 0 && ` · ${doneCount} imported`}
            </span>
            <div className="flex items-center gap-2">
              {doneCount > 0 && (
                <Button asChild variant="secondary" size="sm">
                  <Link href="/connections">Back to connections</Link>
                </Button>
              )}
              <Button size="sm" onClick={runImport} disabled={running || valid.length === 0 || doneCount === valid.length}>
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
                Import {valid.length - doneCount}
              </Button>
            </div>
          </div>
          <ul className="surface divide-y divide-[rgb(var(--line))] rounded-md">
            {parsed.candidates.map((c) => {
              const status = statuses[c.index] ?? { state: "idle" };
              const invalid = c.problems.length > 0;
              return (
                <li key={c.index} className={cn("flex items-start gap-3 px-4 py-3 text-xs", invalid && "opacity-70")}>
                  <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-fg-faint">{c.index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fg">{c.name || "(no name)"}</span>
                      <span className="truncate font-mono text-fg-faint">{c.url || "(no url)"}</span>
                      {c.environment && <Badge tone={ENVIRONMENT_META[c.environment].tone}>{ENVIRONMENT_META[c.environment].label}</Badge>}
                      {c.postgresUrl && <Badge tone="outline">+ postgres url</Badge>}
                    </div>
                    {invalid && (
                      <ul className="mt-1 space-y-0.5 text-danger">
                        {c.problems.map((p) => (
                          <li key={p}>• {p}</li>
                        ))}
                      </ul>
                    )}
                    {status.state === "failed" && (
                      <p className="mt-1 text-danger">
                        {status.message}
                        {status.upgrade && (
                          <>
                            {" "}
                            <Link href="/settings/billing" className="underline">
                              Upgrade
                            </Link>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0">
                    {status.state === "running" && <Loader2 className="h-4 w-4 animate-spin text-fg-muted" aria-hidden />}
                    {status.state === "done" && (
                      <Link href={`/c/${status.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                        <Check className="h-4 w-4" aria-hidden /> open
                      </Link>
                    )}
                    {status.state === "failed" && <X className="h-4 w-4 text-danger" aria-hidden />}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
