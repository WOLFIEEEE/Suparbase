import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/server/auth";
import { listConnections } from "@/server/connections/repo";
import { ConnectionList } from "@/components/connections/ConnectionList";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await auth();
  // RequireConnection guard via layout would 401 us if session was missing; type-narrow:
  if (!session?.user) return null;
  const connections = await listConnections(session.user.id);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-display-md">Connections</h1>
          <p className="text-sm text-fg-muted">
            Saved Supabase projects. Click one to open its admin workspace.
          </p>
        </div>
        <Button asChild>
          <Link href="/connections/new">
            <Plus className="h-3.5 w-3.5" aria-hidden /> New connection
          </Link>
        </Button>
      </header>

      {connections.length === 0 ? (
        <EmptyState
          title="No connections yet"
          description="Add your first Supabase project to get started."
          action={
            <Button asChild>
              <Link href="/connections/new">
                <Plus className="h-3.5 w-3.5" aria-hidden /> New connection
              </Link>
            </Button>
          }
        />
      ) : (
        <ConnectionList initial={connections} />
      )}
    </div>
  );
}
