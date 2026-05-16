import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getUserDetail } from "@/server/admin/repo";
import { listBillingEventsForUser } from "@/server/billing/repo";
import { GrantPlanForm, ResetSubscriptionForm } from "./forms";

// RFC 4122 UUID pattern. Guards against `/admin/users/garbage` which
// would otherwise let Postgres reject the malformed cast and bubble
// up as a 500 — confusing for the operator.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = {
  title: "Admin · User",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const user = await getUserDetail(id);
  if (!user) notFound();
  const events = await listBillingEventsForUser(id, 30);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden /> All users
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="font-display text-display-md">{user.email}</h1>
        <p className="text-sm text-fg-muted">
          {user.name ?? "—"} · joined {user.createdAt ? formatDate(user.createdAt) : "?"} ·{" "}
          {user.connectionCount} connection{user.connectionCount === 1 ? "" : "s"}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Plan" value={user.plan} />
        <Field label="Status" value={user.status} />
        <Field
          label="Trial ends"
          value={user.trialEndsAt ? formatDate(user.trialEndsAt) : "—"}
        />
        <Field
          label="Renews"
          value={user.currentPeriodEnd ? formatDate(user.currentPeriodEnd) : "—"}
        />
        <Field
          label="Dodo customer"
          value={user.dodoCustomerId ? user.dodoCustomerId : "—"}
          mono
        />
        <Field
          label="Dodo subscription"
          value={user.dodoSubscriptionId ? user.dodoSubscriptionId : "—"}
          mono
        />
      </section>

      {user.adminNote && (
        <section className="rounded-md border hairline bg-bg-raised/40 p-4 text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-fg-faint">Admin note</p>
          <p className="mt-1 text-fg-muted">{user.adminNote}</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl">Grant a plan</h2>
        <p className="text-xs text-fg-muted">
          Grants are recorded as comped (no Dodo charge). Use for refunds, design
          partners, employees, or Team-plan customers we haven&apos;t self-served yet.
        </p>
        <GrantPlanForm targetUserId={user.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Reset</h2>
        <p className="text-xs text-fg-muted">
          Resets to Free + clears Dodo identifiers. Use only when you&apos;ve also
          cancelled on Dodo&apos;s side; otherwise the next webhook will repopulate
          this row.
        </p>
        <ResetSubscriptionForm targetUserId={user.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl">Recent billing events</h2>
        {events.length === 0 ? (
          <p className="text-xs text-fg-muted">No webhooks received for this user yet.</p>
        ) : (
          <ul className="divide-y hairline overflow-hidden rounded-lg border hairline bg-bg-raised">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                <span className="font-mono text-fg">{e.eventType}</span>
                <span className="font-mono text-fg-faint">{formatDateTime(e.receivedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border hairline bg-bg-raised p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{label}</p>
      <p className={mono ? "mt-1 font-mono text-xs" : "mt-1 text-sm"}>{value}</p>
    </div>
  );
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
