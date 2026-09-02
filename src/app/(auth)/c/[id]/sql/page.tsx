import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionAccess, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { SqlPlayground } from "@/components/sql/SqlPlayground";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SqlPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) notFound();
  const connection = toSummary(access.conn, access.role);

  if (!connection.hasPostgresUrl) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumbs={[
            { label: connection.name, href: `/c/${connection.id}` },
            { label: "SQL" },
          ]}
          title="SQL playground"
          subtitle={
            <span className="text-xs text-fg-muted">
              Run raw SQL against your project. Needs a direct Postgres URL.
            </span>
          }
        />
        <section className="surface space-y-3 rounded-md p-6">
          <h2 className="font-display text-base">Direct Postgres URL not configured</h2>
          <p className="max-w-prose text-xs text-fg-muted">
            The SQL playground shares the same direct-Postgres connection as the
            RLS debugger. Open the RLS page to paste your project&apos;s
            connection string: we encrypt it with the same vault key that
            stores your PostgREST key, and only the RLS and SQL pages ever read
            it.
          </p>
          {access.role === "owner" && (
            <Button asChild>
              <Link href={`/c/${connection.id}/rls`}>Configure Postgres URL →</Link>
            </Button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "SQL" },
        ]}
        title="SQL playground"
        subtitle={
          <span className="text-xs text-fg-muted">
            Run arbitrary SQL. Read-only by default: writes need an explicit
            toggle and burn write-rate tokens.
          </span>
        }
      />
      <SqlPlayground connectionId={connection.id} canWrite={access.role !== "viewer"} />
    </div>
  );
}
