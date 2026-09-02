import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionAccess, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { AuthUsers } from "@/components/auth-users/AuthUsers";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AuthUsersPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) notFound();
  const connection = toSummary(access.conn, access.role);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "Auth users" },
        ]}
        title="Auth users"
        subtitle={
          <span className="text-xs text-fg-muted">
            Browse Supabase Auth users. Owner access and a service-role key are
            required for invitations, recovery, bans, and deletion.
          </span>
        }
      />
      <AuthUsers connection={connection} />
    </div>
  );
}
