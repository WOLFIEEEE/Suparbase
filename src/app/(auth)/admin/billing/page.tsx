import type { Metadata } from "next";
import { listRecentBillingEvents } from "@/server/billing/repo";

export const metadata: Metadata = {
  title: "Admin · Webhook events",
};

export default async function AdminBillingPage() {
  const events = await listRecentBillingEvents(200);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Webhook events</h1>
        <p className="text-sm text-fg-muted">
          The last 200 webhooks received from Dodo Payments. Useful when a payment
          succeeded but the user&apos;s plan didn&apos;t flip — search for their
          subscription id here.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="rounded-lg border hairline bg-bg-raised p-6 text-sm text-fg-muted">
          No webhooks received yet. Once you wire the Dodo dashboard to{" "}
          <code className="font-mono">/api/webhooks/dodo</code>, events will land here.
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border hairline bg-bg-raised text-xs">
          <thead className="bg-bg-raised/60 text-left">
            <tr className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
              <th className="px-4 py-2">Received</th>
              <th className="px-4 py-2">Event</th>
              <th className="px-4 py-2">Subscription</th>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2 text-right">Webhook id</th>
            </tr>
          </thead>
          <tbody className="divide-y hairline">
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-bg/30">
                <td className="px-4 py-2 font-mono text-fg-faint">{formatDateTime(e.receivedAt)}</td>
                <td className="px-4 py-2 font-mono text-fg">{e.eventType}</td>
                <td className="px-4 py-2 font-mono text-fg-muted">{e.dodoSubscriptionId ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-fg-muted">{e.userId ?? "—"}</td>
                <td className="px-4 py-2 text-right font-mono text-fg-faint">{e.webhookId.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
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
