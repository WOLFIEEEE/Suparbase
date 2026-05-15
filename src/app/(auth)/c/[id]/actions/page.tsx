import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { ActionsManager } from "@/components/actions/ActionsManager";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ActionsPage({ params }: Props) {
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
          { label: "Actions" },
        ]}
        title="Custom actions"
        subtitle={
          <span className="text-xs text-fg-muted">
            Buttons backed by SQL templates or webhooks. Surfaced on the
            table or row pages you scope them to.
          </span>
        }
      />
      <ActionsManager connectionId={connection.id} />
    </div>
  );
}
