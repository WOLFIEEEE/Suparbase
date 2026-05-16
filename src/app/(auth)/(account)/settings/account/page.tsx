import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AccountSettingsPanel } from "@/components/settings/AccountSettingsPanel";

export const metadata: Metadata = {
  title: "Account · Suparbase",
};

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  return (
    <AccountSettingsPanel
      email={session.user.email ?? ""}
      name={session.user.name ?? null}
    />
  );
}
