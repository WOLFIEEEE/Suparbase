import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { SentryDashboard } from "@/components/sentry/SentryDashboard";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SentryPage({ params }: Props) {
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
          { label: "Sentry" },
        ]}
        title="Sentry"
        subtitle={
          <span className="text-xs text-fg-muted">
            Continuous security watchdog. Probes your project with the anon
            REST key, reads <code className="font-mono text-[11px]">pg_policies</code>,
            and flags drift before it ends up on Hacker News.
          </span>
        }
      />
      <SentryDashboard connectionId={connection.id} />
    </div>
  );
}
