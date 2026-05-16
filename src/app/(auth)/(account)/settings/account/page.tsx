import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { AccountSettingsPanel } from "@/components/settings/AccountSettingsPanel";

export const metadata: Metadata = {
  title: "Account · Suparbase",
};

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const rows = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return (
    <AccountSettingsPanel
      email={session.user.email ?? ""}
      name={session.user.name ?? null}
      emailVerifiedAt={rows[0]?.emailVerified?.toISOString() ?? null}
    />
  );
}
