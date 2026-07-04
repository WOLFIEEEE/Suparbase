"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Watch {
  id: string;
  name: string;
  sql: string;
  webhookUrl: string | null;
  intervalMinutes: number;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastMatchCount: number;
  lastAlertedAt: string | null;
  lastError: string | null;
}

export function WatchesManager({
  connectionId,
  hasPostgresUrl,
  hasAlertWebhook,
}: {
  connectionId: string;
  hasPostgresUrl: boolean;
  hasAlertWebhook: boolean;
}) {
  const qc = useQueryClient();
  const key = ["watches", connectionId];
  const { data } = useQuery<{ watches: Watch[] }>({
    queryKey: key,
    queryFn: async () => (await fetch(`/api/connections/${connectionId}/watches`)).json(),
  });
  const watches = data?.watches ?? [];

  const [name, setName] = useState("");
  const [sql, setSql] = useState("SELECT * FROM public.orders WHERE status = 'failed'");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(60);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/connections/${connectionId}/watches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sql: sql.trim(),
          webhookUrl: webhookUrl.trim() || null,
          intervalMinutes,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(e?.message ?? "Could not create the watch.");
      }
    },
    onSuccess: () => {
      toast.success("Watch created");
      setName("");
      setWebhookUrl("");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await fetch(`/api/connections/${connectionId}/watches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/connections/${connectionId}/watches/${id}`, { method: "DELETE" });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  if (!hasPostgresUrl) {
    return (
      <p className="surface rounded-md p-6 text-sm text-fg-muted">
        Watches run SQL through the Direct Postgres URL. Add it in Connection settings to enable them.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface space-y-4 rounded-md p-6">
        <header className="space-y-1">
          <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            <Bell className="h-3 w-3" aria-hidden /> New watch
          </h2>
          <p className="text-xs text-fg-muted">
            Alerts fire only when the match count <strong className="text-fg">grows</strong> — a new match
            appeared, not the same rows every tick.
            {!hasAlertWebhook && " Set a webhook below (the connection has no Sentry alert webhook to fall back on)."}
          </p>
        </header>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !sql.trim() || create.isPending) return;
            create.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="w-name">Watch name</Label>
              <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Failed payments" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-interval">Check every (minutes)</Label>
              <Input
                id="w-interval"
                type="number"
                min={5}
                max={1440}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Math.max(5, Number(e.target.value) || 5))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-sql">Condition (SELECT)</Label>
            <textarea
              id="w-sql"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={3}
              spellCheck={false}
              className="block w-full resize-y rounded border hairline bg-bg-sunken px-3 py-2 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-webhook">Webhook URL {hasAlertWebhook && "(optional — falls back to the Sentry alert webhook)"}</Label>
            <Input
              id="w-webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              maxLength={2000}
              placeholder="https://hooks.slack.com/…"
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create watch"}
          </Button>
        </form>
      </section>

      <section className="space-y-2">
        {watches.length === 0 ? (
          <p className="surface rounded-md p-6 text-sm text-fg-muted">No watches yet.</p>
        ) : (
          watches.map((w) => (
            <article key={w.id} className="surface flex items-center gap-3 rounded-md p-4">
              <Bell className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{w.name}</span>
                  <span className="rounded-full bg-bg-sunken px-1.5 py-0 text-[10px] tabular-nums text-fg-muted">
                    {w.lastMatchCount} match{w.lastMatchCount === 1 ? "" : "es"}
                  </span>
                  {!w.enabled && (
                    <span className="rounded-full bg-bg-sunken px-1.5 py-0 text-[10px] uppercase tracking-wide text-fg-faint">
                      paused
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-fg-faint">
                  every {w.intervalMinutes}m
                  {w.lastCheckedAt ? ` · checked ${new Date(w.lastCheckedAt).toLocaleString()}` : " · never checked"}
                  {w.lastError ? ` · error: ${w.lastError}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle.mutate({ id: w.id, enabled: !w.enabled })}
                className="shrink-0 rounded border hairline px-2 py-1 text-[11px] text-fg-muted hover:text-fg"
              >
                {w.enabled ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(w.id)}
                aria-label={`Delete watch ${w.name}`}
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
