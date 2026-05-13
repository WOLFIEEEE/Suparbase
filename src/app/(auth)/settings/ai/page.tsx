import { auth } from "@/server/auth";
import { getUserSettings, toSummary } from "@/server/settings/repo";
import { AiSettingsForm } from "@/components/settings/AiSettingsForm";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const row = await getUserSettings(session.user.id);
  return <AiSettingsForm initial={toSummary(row)} />;
}
