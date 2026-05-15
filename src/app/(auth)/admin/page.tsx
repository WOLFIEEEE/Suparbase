import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, DollarSign, UserPlus, Users } from "lucide-react";
import { getBillingStats } from "@/server/billing/repo";
import { getUserStats } from "@/server/admin/repo";

export const metadata: Metadata = {
  title: "Admin · Dashboard",
};

export default async function AdminDashboardPage() {
  const [billing, users] = await Promise.all([getBillingStats(), getUserStats()]);
  const mrr = (billing.estimatedMonthlyRevenueCents / 100).toFixed(0);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Dashboard</h1>
        <p className="text-sm text-fg-muted">
          Snapshot of the SaaS — refreshes on each load. Drill into{" "}
          <Link href="/admin/users" className="text-accent hover:underline">
            users
          </Link>{" "}
          or{" "}
          <Link href="/admin/billing" className="text-accent hover:underline">
            webhook events
          </Link>{" "}
          for details.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={Users} label="Total users" value={users.totalUsers.toLocaleString()} />
        <Stat
          icon={UserPlus}
          label="New, last 7 days"
          value={users.newThisWeek.toLocaleString()}
        />
        <Stat
          icon={CheckCircle2}
          label="Paying users"
          value={billing.paidActive.toLocaleString()}
          sub={`${billing.trialing} on trial`}
        />
        <Stat
          icon={DollarSign}
          label="Est. MRR"
          value={`$${mrr}`}
          sub="from active subs"
        />
      </section>

      <section className="rounded-lg border hairline bg-bg-raised/40 p-5 text-sm">
        <h2 className="font-display text-base">What this is</h2>
        <p className="mt-2 text-fg-muted">
          MRR is computed from the price catalog × active subscriptions; it doesn&apos;t
          factor in Dodo&apos;s adaptive-currency adjustments, discounts, or tax. Trial
          users aren&apos;t counted until they convert.
        </p>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <article className="rounded-lg border hairline bg-bg-raised p-4">
      <div className="flex items-center gap-2 text-xs text-fg-faint">
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
        <span className="uppercase tracking-[0.18em]">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-fg-faint">{sub}</p>}
    </article>
  );
}
