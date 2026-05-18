import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

interface Props {
  /** What plan they were on - shown in the copy. */
  planLabel: string;
}

/**
 * Site-wide banner shown above the workspace when a user's
 * subscription is in dunning (Dodo couldn't charge their card). Two
 * goals:
 *
 *   1. Make sure the user actually knows. Email lands but is often
 *      missed; an in-app banner they see every page-load isn't.
 *   2. Give them a one-click fix path: link straight to /settings/billing
 *      where they can launch the Dodo customer portal.
 *
 * Rendered server-side from the `(auth)/layout.tsx` so every signed-in
 * page surfaces it - the dashboard, the workspace, settings, even the
 * admin panel.
 */
export function PastDueBanner({ planLabel }: Props) {
  return (
    <div
      role="alert"
      className="border-b border-danger/50 bg-danger/10 px-4 py-2.5 text-sm text-danger sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          <strong className="font-medium">Payment problem.</strong>{" "}
          We couldn&rsquo;t charge your card for your {planLabel} subscription.
          Update your payment method before Dodo&rsquo;s retries run out.
        </p>
        <Link
          href="/settings/billing"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-danger/40 px-3 text-xs font-medium hover:bg-danger/20"
        >
          Update billing
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
