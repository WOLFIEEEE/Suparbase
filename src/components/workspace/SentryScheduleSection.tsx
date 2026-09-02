"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { relativeFromNow } from "@/lib/ui/time";
import {
  SENTRY_SCAN_INTERVALS,
  SENTRY_SCAN_INTERVAL_LABEL,
  isSentryScanInterval,
} from "@/lib/sentry/schedule";
import type { ConnectionSummary } from "@/lib/types/connection";

/**
 * Owner-only cadence picker for unattended Sentry scans. Runs through
 * /api/cron/sentry; new criticals hit the alert webhook and the in-app
 * inbox exactly like a manual scan.
 */
export function SentryScheduleSection({ connection }: { connection: ConnectionSummary }) {
  const router = useRouter();
  const [value, setValue] = useState<number>(connection.sentryScanIntervalHours ?? 0);

  const save = useMutation({
    mutationFn: async (hours: number) => {
      const res = await fetch(`/api/connections/${connection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentryScanIntervalHours: hours > 0 ? hours : null }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(e?.message ?? "Could not save the schedule.");
      }
    },
    onSuccess: (_, hours) => {
      toast.success(hours > 0 ? "Scheduled scans enabled" : "Scheduled scans turned off");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (connection.myRole !== "owner") return null;
  const dirty = value !== (connection.sentryScanIntervalHours ?? 0);

  return (
    <section className="surface space-y-4 rounded-md p-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
          <CalendarClock className="h-3 w-3" aria-hidden /> Scheduled Sentry scans
        </h2>
        <p className="text-xs text-fg-muted">
          Re-run the security probe unattended. New critical findings go to the alert webhook and
          your in-app inbox; known issues stay quiet. Needs <code className="font-mono">CRON_SECRET</code>{" "}
          and a scheduler hitting <code className="font-mono">/api/cron/sentry</code> on the deployment.
        </p>
      </header>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="sentry-interval">Cadence</Label>
          <select
            id="sentry-interval"
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              setValue(n === 0 || isSentryScanInterval(n) ? n : 0);
            }}
            className="h-10 rounded border hairline bg-bg-raised px-3 text-sm"
          >
            <option value={0}>Off</option>
            {SENTRY_SCAN_INTERVALS.map((h) => (
              <option key={h} value={h}>
                {SENTRY_SCAN_INTERVAL_LABEL[h]}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={() => save.mutate(value)} disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save schedule"}
        </Button>
        {connection.sentryScanIntervalHours ? (
          <span className="text-[11px] text-fg-faint sm:ml-2 sm:pb-2.5">
            {connection.sentryLastAutoScanAt
              ? `last automatic scan ${relativeFromNow(connection.sentryLastAutoScanAt)}`
              : "first automatic scan pending"}
          </span>
        ) : null}
      </div>
    </section>
  );
}
