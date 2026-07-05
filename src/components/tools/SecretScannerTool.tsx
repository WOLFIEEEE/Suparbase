"use client";

import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { scanSecrets, summarize, type Severity } from "@/lib/tools/secret-scan";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/ui/cn";

const SEVERITY_TONE: Record<Severity, "danger" | "warn" | "neutral" | "accent"> = {
  critical: "danger",
  high: "danger",
  medium: "warn",
  info: "neutral",
};

const EXAMPLE = `# Paste code, .env, or logs. Nothing leaves your browser.
SUPABASE_URL=https://abcd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig
DATABASE_URL=postgres://postgres:hunter2@db.abcd.supabase.co:5432/postgres`;

export function SecretScannerTool() {
  const [text, setText] = useState("");
  const matches = useMemo(() => (text.trim() ? scanSecrets(text) : []), [text]);
  const summary = summarize(matches);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-[12px] text-fg-muted">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          <strong className="text-fg">Runs entirely in your browser.</strong> Nothing you paste is sent
          anywhere. No upload, no logging, no account.
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={EXAMPLE}
        aria-label="Text to scan for secrets"
        className="block w-full resize-y rounded-md border hairline bg-bg-sunken px-4 py-3 font-mono text-xs leading-relaxed focus:border-line-strong focus:outline-none"
      />

      {text.trim() && (
        <div>
          {matches.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
              No known secret patterns found in this text.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-danger" aria-hidden />
                <span className="font-medium">
                  {summary.total} potential secret{summary.total === 1 ? "" : "s"} found
                </span>
                {(["critical", "high", "medium", "info"] as const)
                  .filter((s) => summary.counts[s] > 0)
                  .map((s) => (
                    <Badge key={s} tone={SEVERITY_TONE[s]}>
                      {summary.counts[s]} {s}
                    </Badge>
                  ))}
              </div>
              <ul className="space-y-2">
                {matches.map((m, i) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded-md border p-3",
                      m.severity === "critical" || m.severity === "high"
                        ? "border-danger/30 bg-danger/5"
                        : m.severity === "medium"
                          ? "border-warn/30 bg-warn/5"
                          : "border hairline bg-bg-raised",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={SEVERITY_TONE[m.severity]}>{m.severity}</Badge>
                      <span className="text-sm font-medium">{m.label}</span>
                      <code className="rounded bg-bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                        {m.preview}
                      </code>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{m.advice}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
