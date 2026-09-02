import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForRole, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { ReportsManager } from "@/components/workspace/ReportsManager";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReportsPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const row = await getConnectionForRole(session.user.id, id, "editor");
  if (!row) notFound();
  const connection = toSummary(row, row.userId === session.user.id ? "owner" : "editor");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: connection.name, href: `/c/${connection.id}` }, { label: "Reports" }]}
        title="Scheduled reports"
        subtitle={
          <span className="text-sm text-fg-muted">
            Run a saved SQL snippet on a schedule and get the results by email or webhook.
          </span>
        }
      />
      <ReportsManager connectionId={connection.id} hasPostgresUrl={connection.hasPostgresUrl} />
    </div>
  );
}
