import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/schema";
import { countRemainingRecoveryCodes } from "@/server/auth/totp";
import { TwoFactorPanel } from "@/components/settings/TwoFactorPanel";

export const metadata: Metadata = {
  title: "Two-factor authentication · Suparbase",
};

export default async function TwoFactorSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const rows = await db
    .select({
      email: users.email,
      totpEnabledAt: users.totpEnabledAt,
      hasPassword: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const row = rows[0];
  if (!row) redirect("/signin");

  const enabled = row.totpEnabledAt != null;
  const remainingCodes = enabled ? await countRemainingRecoveryCodes(session.user.id) : 0;

  return (
    <TwoFactorPanel
      email={row.email ?? session.user.email ?? ""}
      enabled={enabled}
      enabledAt={row.totpEnabledAt?.toISOString() ?? null}
      remainingRecoveryCodes={remainingCodes}
      hasPassword={row.hasPassword !== null}
    />
  );
}
