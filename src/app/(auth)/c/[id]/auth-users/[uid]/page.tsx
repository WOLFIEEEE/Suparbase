import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { PageHeader } from "@/components/workspace/PageHeader";
import { UserDetail } from "@/components/auth-users/UserDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string; uid: string }>;
}

export default async function AuthUserDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id, uid } = await params;
  const row = await getConnectionForUser(session.user.id, id);
  if (!row) notFound();
  const connection = toSummary(row);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "Auth users", href: `/c/${connection.id}/auth-users` },
          { label: "User" },
        ]}
        title="User detail"
        subtitle={
          <span className="text-xs text-fg-muted">
            Profile, active sessions, and every table that references this
            user, one screen, no SQL needed.
          </span>
        }
      />
      <UserDetail connectionId={connection.id} userId={uid} />
    </div>
  );
}
