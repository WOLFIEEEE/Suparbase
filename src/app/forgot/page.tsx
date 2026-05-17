import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password · Suparbase",
};

export default async function ForgotPasswordPage() {
  const session = await auth();
  // Already signed in? Redirect - changing password while signed in
  // belongs in settings, not on a public page.
  if (session?.user) redirect("/connections");

  return (
    <AuthShell
      eyebrow="Recovery"
      title="Forgot your password?"
      subtitle="Enter your email and we'll send a single-use link to reset it. The link expires in one hour."
      footnote="No account? Create one from the sign-in page."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
