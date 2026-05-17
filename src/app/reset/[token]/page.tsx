import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset password · Suparbase",
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({ params }: Props) {
  const session = await auth();
  // Signed-in users belong in /settings/account if they want to
  // change password - the public reset flow is for locked-out users.
  if (session?.user) redirect("/connections");

  const { token } = await params;

  return (
    <AuthShell
      eyebrow="New password"
      title="Choose a new password"
      subtitle="Single-use link, expires after 1 hour. We'll sign you back in once it's set."
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
