import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { DashboardEditor } from "@/components/dashboards/DashboardEditor";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DashboardEditPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const row = await getConnectionForUser(session.user.id, id);
  if (!row) notFound();
  const connection = toSummary(row);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "Dashboard widgets" },
        ]}
        title="Dashboard widgets"
        subtitle={
          <span className="text-xs text-fg-muted">
            Pin SQL queries as KPI tiles or charts. They render on the
            connection dashboard, read-only, with a 5s timeout.
          </span>
        }
      />
      <DashboardEditor connectionId={connection.id} />
    </div>
  );
}
