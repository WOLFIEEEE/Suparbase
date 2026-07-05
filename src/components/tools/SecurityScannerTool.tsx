"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Lock, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/ui/cn";

interface Finding {
  kind: "anon_read" | "anon_read_pii";
  severity: "info" | "warn" | "critical";
  table: string;
  matchedColumns: string[];
  message: string;
}
interface ScanOk {
  ok: true;
  host: string;
  score: number;
  tablesDiscovered: number;
  tablesScanned: number;
  anonReadableCount: number;
  findings: Finding[];
}
interface ScanErr {
  ok: false;
  category: string;
  message: string;
}
type ScanResponse = ScanOk | ScanErr;

function scoreColor(score: number): string {
  if (score >= 90) return "text-accent";
  if (score >= 70) return "text-warn";
  return "text-danger";
}

export function SecurityScannerTool() {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [owns, setOwns] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!owns) {
      setError("Please confirm you own this project.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/security-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, anonKey: anonKey || undefined, owns: true }),
      });
      const data = (await res.json()) as ScanResponse & { category?: string; message?: string };
      if (!res.ok && "message" in data) {
        setError(data.message ?? "Scan failed.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Couldn't run the scan. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={scan} className="surface space-y-4 rounded-md p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="scan-url">Supabase project URL</Label>
            <Input
              id="scan-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://abcd.supabase.co"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scan-key">Anon key (optional)</Label>
            <Input
              id="scan-key"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGci… (public key from your dashboard)"
              autoComplete="off"
            />
          </div>
        </div>
        <p className="flex items-start gap-2 text-[11px] text-fg-faint">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          The anon key is public by design. It already ships in your app's client bundle. We use it in-flight
          and never store your URL, key, or results. Hosted <code className="font-mono">*.supabase.co</code> projects only.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={owns} onChange={(e) => setOwns(e.target.checked)} className="accent-[rgb(var(--accent))]" />
          I own or am authorised to test this project.
        </label>
        <Button type="submit" disabled={loading || !url.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldAlert className="h-4 w-4" aria-hidden />}
          {loading ? "Scanning…" : "Scan for exposure"}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      {result && result.ok && <ScanReport result={result} />}
      {result && !result.ok && (
        <div className="rounded-md border border-warn/40 bg-warn/5 p-4 text-sm text-warn">{result.message}</div>
      )}
    </div>
  );
}

function ScanReport({ result }: { result: ScanOk }) {
  const criticals = result.findings.filter((f) => f.severity === "critical");
  const warns = result.findings.filter((f) => f.severity === "warn");
  return (
    <div className="space-y-5">
      <div className="surface flex flex-wrap items-center gap-6 rounded-md p-6">
        <div className="text-center">
          <div className={cn("font-display text-5xl leading-none", scoreColor(result.score))}>{result.score}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-fg-faint">security score</div>
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div className="flex items-center gap-2 font-medium">
            {result.score >= 90 ? (
              <>
                <ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> Looks locked down
              </>
            ) : (
              <>
                <TriangleAlert className="h-4 w-4 text-danger" aria-hidden /> Exposure found
              </>
            )}
          </div>
          <p className="text-fg-muted">
            Scanned <span className="font-mono text-fg">{result.host}</span>: {result.tablesScanned} of{" "}
            {result.tablesDiscovered} exposed tables. {result.anonReadableCount} readable by anyone,{" "}
            {criticals.length} exposing sensitive columns.
          </p>
        </div>
      </div>

      {result.findings.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          No anonymous-readable tables found. Nice work, RLS is doing its job.
        </div>
      ) : (
        <ul className="space-y-2">
          {[...criticals, ...warns].map((f, i) => (
            <li
              key={i}
              className={cn(
                "rounded-md border p-3",
                f.severity === "critical" ? "border-danger/30 bg-danger/5" : "border-warn/30 bg-warn/5",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={f.severity === "critical" ? "danger" : "warn"}>{f.severity}</Badge>
                <code className="font-mono text-sm text-fg">{f.table}</code>
                {f.matchedColumns.length > 0 && (
                  <span className="font-mono text-[11px] text-danger">{f.matchedColumns.join(", ")}</span>
                )}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{f.message}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-accent/40 bg-accent/5 p-5">
        <h3 className="font-display text-lg">Fix it, and keep it fixed</h3>
        <p className="mt-1 text-sm text-fg-muted">
          This one-shot scan finds the exposure. A Suparbase account gives you one-click quarantine, continuous
          re-scans, and a Slack alert the moment a new table gets exposed, plus a full admin workspace.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/signup">Get continuous monitoring, free</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/agent-sentry">How Agent Sentry works</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
