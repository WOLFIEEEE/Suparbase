import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionAccess, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { ActivityFeed } from "@/components/workspace/ActivityFeed";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ActivityPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) notFound();
  const connection = toSummary(access.conn, access.role);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: connection.name, href: `/c/${connection.id}` }, { label: "Activity" }]}
        title="Activity"
        subtitle={
          <span className="text-sm text-fg-muted">
            Every write proxied through Suparbase, newest first — attributed to the agent that made it.
          </span>
        }
      />
      <ActivityFeed connectionId={connection.id} />
    </div>
  );
}
