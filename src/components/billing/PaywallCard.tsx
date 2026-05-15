import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

interface Props {
  title?: string;
  message: string;
  upgradeUrl?: string;
}

/**
 * Inline paywall callout shown when the server returns 402
 * `category: "plan_limit"` for the current action. Tells the user
 * exactly what's blocked and links to /settings/billing.
 */
export function PaywallCard({
  title = "Upgrade required",
  message,
  upgradeUrl = "/settings/billing",
}: Props) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div className="flex-1 space-y-1">
        <p className="font-medium text-fg">{title}</p>
        <p className="text-xs text-fg-muted">{message}</p>
      </div>
      <Link
        href={upgradeUrl}
        className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
      >
        See plans
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}
