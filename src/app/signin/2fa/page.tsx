import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { TwoFactorVerifyForm } from "@/components/auth/TwoFactorVerifyForm";

export const metadata: Metadata = {
  title: "Two-factor authentication · Suparbase",
};

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function TwoFactorSignInPage({ searchParams }: Props) {
  const session = await auth();
  // No session at all → user shouldn't be here, send to /signin.
  if (!session?.user) redirect("/signin");
  const { next } = await searchParams;

  return (
    <AuthShell
      eyebrow="Verify"
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app, or a recovery code if you've lost the device."
    >
      <TwoFactorVerifyForm next={next ?? "/connections"} />
    </AuthShell>
  );
}
