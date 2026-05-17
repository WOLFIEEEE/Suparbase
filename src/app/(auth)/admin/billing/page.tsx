import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import {
  listRecentBillingEvents,
  listUnappliedBillingEvents,
} from "@/server/billing/repo";

export const metadata: Metadata = {
  title: "Admin · Webhook events",
};

export default async function AdminBillingPage() {
  const [events, unapplied] = await Promise.all([
    listRecentBillingEvents(200),
    listUnappliedBillingEvents(50),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Webhook events</h1>
        <p className="text-sm text-fg-muted">
          The last 200 webhooks received from Dodo Payments. Useful when a payment
          succeeded but the user&apos;s plan didn&apos;t flip - search for their
          subscription id here.
        </p>
      </header>

      {unapplied.length > 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-fg">
                {unapplied.length} event{unapplied.length === 1 ? "" : "s"} received but not yet applied
              </p>
              <p className="text-xs text-fg-muted">
                These webhooks were verified and recorded but the follow-up{" "}
                <code className="font-mono">subscriptions</code> mutation failed (transient DB
                error or an unrecognised event type). Dodo will keep retrying until they succeed.
                If they stay stuck, check the application logs around the timestamps below.
              </p>
              <ul className="space-y-1 text-[11px]">
                {unapplied.slice(0, 10).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 font-mono text-fg-faint">
                    <span>{e.eventType}</span>
                    <span>{formatDateTime(e.receivedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {events.length === 0 ? (
        <div className="rounded-lg border hairline bg-bg-raised p-6 text-sm text-fg-muted">
          No webhooks received yet. Once you wire the Dodo dashboard to{" "}
          <code className="font-mono">/api/webhooks/dodo</code>, events will land here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border hairline bg-bg-raised">
        <table className="w-full text-xs">
          <thead className="bg-bg-raised/60 text-left">
            <tr className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
              <th scope="col" className="px-4 py-2">Received</th>
              <th scope="col" className="px-4 py-2">Event</th>
              <th scope="col" className="px-4 py-2">Applied</th>
              <th scope="col" className="px-4 py-2">Subscription</th>
              <th scope="col" className="px-4 py-2">User</th>
              <th scope="col" className="px-4 py-2 text-right">Webhook id</th>
            </tr>
          </thead>
          <tbody className="divide-y hairline">
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-bg/30">
                <td className="px-4 py-2 font-mono text-fg-faint">{formatDateTime(e.receivedAt)}</td>
                <td className="px-4 py-2 font-mono text-fg">{e.eventType}</td>
                <td className="px-4 py-2 font-mono">
                  {e.appliedAt ? (
                    <span className="text-accent">✓</span>
                  ) : (
                    <span className="text-amber-400">pending</span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-fg-muted">{e.dodoSubscriptionId ?? "-"}</td>
                <td className="px-4 py-2 font-mono text-fg-muted">{e.userId ?? "-"}</td>
                <td className="px-4 py-2 text-right font-mono text-fg-faint">{e.webhookId.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
