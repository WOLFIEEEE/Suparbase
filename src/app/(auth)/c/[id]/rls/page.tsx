import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RlsDebugger } from "@/components/rls/RlsDebugger";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RlsPage({ params }: Props) {
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
          { label: "RLS" },
        ]}
        title="Row-level security"
        subtitle={
          <span className="text-xs text-fg-muted">
            Browse the active RLS policies on this project and simulate
            requests as different roles.
          </span>
        }
      />
      <RlsDebugger connection={connection} />
    </div>
  );
}
