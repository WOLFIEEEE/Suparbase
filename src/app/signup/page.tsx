import { redirect } from "next/navigation";
import { auth, isGithubEnabled } from "@/server/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";

interface SignUpPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const session = await auth();
  const { next } = await searchParams;
  if (session?.user) redirect(next ?? "/connections");

  return (
    <AuthShell
      eyebrow="Free · takes a minute"
      title="Create your account"
      subtitle="Bring a Supabase key after signup: we'll encrypt it before it touches disk and never expose it to a browser."
      footnote="No credit card. No newsletter. The only outbound emails we send are password recovery links you trigger yourself."
    >
      <SignUpForm githubEnabled={isGithubEnabled()} />
    </AuthShell>
  );
}
