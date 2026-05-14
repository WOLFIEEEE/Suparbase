import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { StorageBrowser } from "@/components/storage/StorageBrowser";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StoragePage({ params }: Props) {
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
          { label: "Storage" },
        ]}
        title="Storage"
        subtitle={
          <span className="text-xs text-fg-muted">
            Browse buckets, upload and delete files, mint signed URLs. Uses
            your stored Supabase key: same auth as the table proxy.
          </span>
        }
      />
      <StorageBrowser connection={connection} />
    </div>
  );
}
