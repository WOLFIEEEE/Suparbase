import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/server/auth";
import { listConnections } from "@/server/connections/repo";
import { getActivePlan } from "@/server/billing/repo";
import { PLAN_LIMITS } from "@/server/billing/plans";
import { ConnectionList } from "@/components/connections/ConnectionList";
import { ConnectionsOnboarding } from "@/components/connections/ConnectionsOnboarding";
import { PlanUsageBar } from "@/components/connections/PlanUsageBar";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const [connections, active] = await Promise.all([
    listConnections(session.user.id),
    getActivePlan(session.user.id),
  ]);

  const ownedCount = connections.filter((c) => c.myRole === "owner").length;
  const cap = active.limits.maxConnections;
  const atLimit = cap !== null && ownedCount >= cap;

  // First-run experience: show the onboarding card for new users
  // (no connections owned). Once they have any owned connection it
  // collapses to the regular list + usage bar.
  if (connections.length === 0) {
    return (
      <div className="space-y-8">
        <header className="space-y-1">
          <h1 className="font-display text-display-md">Welcome to Suparbase</h1>
          <p className="text-sm text-fg-muted">
            Three steps to your first admin workspace.
          </p>
        </header>
        <ConnectionsOnboarding />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-display-md">Connections</h1>
          <p className="text-sm text-fg-muted">
            Saved Supabase projects. Click one to open its admin workspace.
          </p>
        </div>
        <Button asChild disabled={atLimit}>
          <Link
            href={atLimit ? "/settings/billing" : "/connections/new"}
            aria-label={atLimit ? "Upgrade to add another connection" : "New connection"}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {atLimit ? "Upgrade to add" : "New connection"}
          </Link>
        </Button>
      </header>

      {!active.isPaid && (
        <PlanUsageBar
          planLabel={PLAN_LIMITS.free.label}
          used={ownedCount}
          cap={cap ?? 0}
          canInviteTeam={active.limits.canInviteTeam}
        />
      )}

      <ConnectionList initial={connections} />
    </div>
  );
}
