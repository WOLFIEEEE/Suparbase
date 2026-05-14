import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
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
  const row = await getConnectionForUser(session.user.id, id);
  if (!row) notFound();
  const connection = toSummary(row);

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
            Invite, recover, ban, or delete users via Supabase&apos;s admin API.
            Needs a service_role key on this connection.
          </span>
        }
      />
      <AuthUsers connection={connection} />
    </div>
  );
}
