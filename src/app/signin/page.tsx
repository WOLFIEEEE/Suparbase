import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, isGithubEnabled } from "@/server/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = {
  title: "Sign in · Suparbase",
  robots: { index: false, follow: false },
};

interface SignInPageProps {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}

function mapError(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "OAuthAccountNotLinked") {
    return "An account with this email already exists with a different sign-in method.";
  }
  if (error === "CredentialsSignin") return "Invalid email or password.";
  return "Sign-in failed.";
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const { next, error, reset } = await searchParams;
  if (session?.user) redirect(next ?? "/connections");

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in"
      subtitle={
        reset === "1"
          ? "Password updated. Sign in with the new one."
          : "Pick up where you left off: your saved connections and AI history are waiting."
      }
      footnote="By signing in you agree to a basic operator-side audit log of writes performed through your connections."
    >
      <SignInForm githubEnabled={isGithubEnabled()} error={mapError(error)} />
    </AuthShell>
  );
}
