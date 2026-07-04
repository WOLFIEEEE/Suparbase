"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Mail, Trash2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/ui/cn";

interface Snippet {
  id: string;
  name: string;
  sql: string;
}
interface Report {
  id: string;
  name: string;
  snippetId: string;
  delivery: "email" | "webhook";
  target: string;
  intervalHours: number;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
}

export function ReportsManager({
  connectionId,
  hasPostgresUrl,
}: {
  connectionId: string;
  hasPostgresUrl: boolean;
}) {
  const qc = useQueryClient();
  const reportsKey = ["reports", connectionId];

  const { data: reportsData } = useQuery<{ reports: Report[] }>({
    queryKey: reportsKey,
    queryFn: async () => (await fetch(`/api/connections/${connectionId}/reports`)).json(),
  });
  const { data: snippetsData } = useQuery<{ snippets: Snippet[] }>({
    queryKey: ["sql-snippets", connectionId],
    queryFn: async () => (await fetch(`/api/connections/${connectionId}/sql-snippets`)).json(),
  });
  const snippets = snippetsData?.snippets ?? [];
  const reports = reportsData?.reports ?? [];

  const [snippetId, setSnippetId] = useState("");
  const [name, setName] = useState("");
  const [delivery, setDelivery] = useState<"email" | "webhook">("email");
  const [target, setTarget] = useState("");
  const [intervalHours, setIntervalHours] = useState(24);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/connections/${connectionId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippetId, name: name.trim(), delivery, target: target.trim(), intervalHours }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(e?.message ?? "Could not create the report.");
      }
    },
    onSuccess: () => {
      toast.success("Report scheduled");
      setName("");
      setTarget("");
      setSnippetId("");
      void qc.invalidateQueries({ queryKey: reportsKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await fetch(`/api/connections/${connectionId}/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: reportsKey }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/connections/${connectionId}/reports/${id}`, { method: "DELETE" });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: reportsKey }),
  });

  if (!hasPostgresUrl) {
    return (
      <p className="surface rounded-md p-6 text-sm text-fg-muted">
        Reports run SQL through the Direct Postgres URL. Add it in Connection settings to enable them.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <section className="surface space-y-4 rounded-md p-6">
        <header className="space-y-1">
          <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            <CalendarClock className="h-3 w-3" aria-hidden /> New report
          </h2>
          <p className="text-xs text-fg-muted">
            Pick a saved snippet, choose delivery, and set the cadence. Results are read-only.
          </p>
        </header>
        {snippets.length === 0 ? (
          <p className="text-xs text-fg-muted">
            No saved snippets yet. Save a query in the SQL playground first, then schedule it here.
          </p>
        ) : (
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!snippetId || !name.trim() || !target.trim() || create.isPending) return;
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="rep-snippet">Snippet</Label>
              <select
                id="rep-snippet"
                value={snippetId}
                onChange={(e) => setSnippetId(e.target.value)}
                className="w-full rounded border hairline bg-bg-raised px-2 py-1.5 text-sm"
              >
                <option value="">Choose a snippet…</option>
                {snippets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-name">Report name</Label>
              <Input id="rep-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Weekly pending orders" />
            </div>
            <div className="space-y-1.5">
              <Label>Delivery</Label>
              <div className="inline-flex rounded border hairline text-[11px]">
                {(["email", "webhook"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDelivery(d)}
                    className={cn(
                      "inline-flex items-center gap-1 px-3 py-1.5 capitalize",
                      delivery === d ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-bg-sunken",
                    )}
                  >
                    {d === "email" ? <Mail className="h-3 w-3" aria-hidden /> : <Webhook className="h-3 w-3" aria-hidden />}
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-target">{delivery === "email" ? "Email address" : "Webhook URL"}</Label>
              <Input
                id="rep-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                maxLength={2000}
                placeholder={delivery === "email" ? "you@company.com" : "https://hooks.slack.com/…"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-interval">Every (hours)</Label>
              <Input
                id="rep-interval"
                type="number"
                min={1}
                max={720}
                value={intervalHours}
                onChange={(e) => setIntervalHours(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Scheduling…" : "Schedule report"}
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* List */}
      <section className="space-y-2">
        {reports.length === 0 ? (
          <p className="surface rounded-md p-6 text-sm text-fg-muted">No scheduled reports yet.</p>
        ) : (
          reports.map((r) => (
            <article key={r.id} className="surface flex items-center gap-3 rounded-md p-4">
              {r.delivery === "email" ? (
                <Mail className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              ) : (
                <Webhook className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  {!r.enabled && (
                    <span className="rounded-full bg-bg-sunken px-1.5 py-0 text-[10px] uppercase tracking-wide text-fg-faint">
                      paused
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-fg-faint">
                  every {r.intervalHours}h → {r.target}
                  {r.lastRunAt ? ` · last ${new Date(r.lastRunAt).toLocaleString()} (${r.lastStatus})` : " · never run"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}
                className="shrink-0 rounded border hairline px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
              >
                {r.enabled ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(r.id)}
                aria-label={`Delete report ${r.name}`}
                className="shrink-0 rounded p-1 text-fg-faint hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
