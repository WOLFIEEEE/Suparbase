import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { SyncWorkspace } from "@/components/sync/SyncWorkspace";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SyncPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const row = await getConnectionForUser(session.user.id, id);
  if (!row) notFound();
  const conn = toSummary(row);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sync"
        subtitle={
          <>
            Refresh this connection from another one. A <strong>base</strong> (e.g. prod) is read,
            never written; this connection is the <strong>target</strong> and is made to mirror it
            with a full-replace per table. Both connections need a Direct Postgres URL.
          </>
        }
      />
      <SyncWorkspace
        connectionId={conn.id}
        targetName={conn.name}
        targetHasPostgresUrl={conn.hasPostgresUrl}
      />
    </div>
  );
}
