import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

interface Props {
  planLabel: string;
  used: number;
  cap: number;
  canInviteTeam: boolean;
}

/**
 * Free-tier usage indicator shown above the connection list. Tells
 * the user where they sit on the plan and pre-empts the 402 paywall
 * with an obvious upgrade nudge. Hidden for paid plans (handled by
 * the caller — render this only when `!active.isPaid`).
 *
 * Renders a progress bar of `used/cap` connections, plus a row of
 * "what unlocking gets you" affordances and a Subscribe CTA.
 */
export function PlanUsageBar({ planLabel, used, cap, canInviteTeam }: Props) {
  const atLimit = used >= cap;
  const pct = cap === 0 ? 0 : Math.min(100, Math.round((used / cap) * 100));

  return (
    <section
      className="rounded-lg border hairline bg-bg-raised p-4"
      aria-label="Plan usage"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-fg-faint">
            {planLabel} plan
          </p>
          <p className="text-sm">
            <span className="font-medium text-fg">
              {used} / {cap} connection{cap === 1 ? "" : "s"}
            </span>
            {atLimit ? (
              <span className="ml-2 text-danger">at limit</span>
            ) : (
              <span className="ml-2 text-fg-muted">
                {cap - used} remaining
              </span>
            )}
            {!canInviteTeam && (
              <span className="ml-2 text-fg-faint">· team invites locked</span>
            )}
          </p>
        </div>
        <Link
          href="/settings/billing"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {atLimit ? "Upgrade to add more" : "Upgrade to Hosted"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={used}
        aria-valuetext={`${used} of ${cap} connections used`}
      >
        <div
          className={`h-full transition-all ${atLimit ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}
