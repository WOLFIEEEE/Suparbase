import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForRole, toSummary } from "@/server/connections/repo";
import { ConnectionSettings } from "@/components/workspace/ConnectionSettings";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConnectionSettingsPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const row = await getConnectionForRole(session.user.id, id, "owner");
  if (!row) notFound();
  return <ConnectionSettings connection={toSummary(row, "owner")} />;
}
