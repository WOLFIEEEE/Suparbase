"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConnectionSummary } from "@/lib/types/connection";

/**
 * Owner-only Sentry alert webhook. Slack / Discord incoming-webhook
 * compatible (the alert payload carries a `text` field), or any endpoint
 * that accepts a JSON POST.
 */
export function AlertWebhookSection({ connection }: { connection: ConnectionSummary }) {
  const isOwner = connection.myRole === "owner";
  const [url, setUrl] = useState(connection.alertWebhookUrl ?? "");

  const save = useMutation({
    mutationFn: async (next: string | null) => {
      const res = await fetch(`/api/connections/${connection.id}/alert-webhook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: next }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(e?.message ?? "Could not save the webhook.");
      }
    },
    onSuccess: (_, next) => toast.success(next ? "Alert webhook saved" : "Alert webhook removed"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner) return null;

  return (
    <section className="surface space-y-4 rounded-md p-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
          <BellRing className="h-3 w-3" aria-hidden /> Sentry alerts
        </h2>
        <p className="text-xs text-fg-muted">
          Get pinged when a scan surfaces <strong className="text-fg">new critical</strong>{" "}
          findings. Works with Slack and Discord incoming webhooks, or any endpoint that
          accepts a JSON POST. Re-scans of a known issue stay quiet.
        </p>
      </header>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(url.trim() || null);
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="alert-webhook-url">Webhook URL</Label>
          <Input
            id="alert-webhook-url"
            type="url"
            placeholder="https://hooks.slack.com/services/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={2000}
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {connection.alertWebhookUrl && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={save.isPending}
              onClick={() => {
                setUrl("");
                save.mutate(null);
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
