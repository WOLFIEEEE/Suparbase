import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isGithubEnabled } from "@/server/auth";
import { SignUpForm } from "@/components/auth/SignUpForm";

interface SignUpPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const session = await auth();
  const { next } = await searchParams;
  if (session?.user) redirect(next ?? "/connections");

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div className="surface w-full max-w-md space-y-6 rounded p-8">
        <div className="space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-xs text-fg-muted hover:text-fg">
            ← back
          </Link>
          <h1 className="font-display text-display-md">Create account</h1>
          <p className="text-sm text-fg-muted">
            Free, takes a few seconds. Your saved Supabase keys are encrypted with AES-256-GCM
            before they touch the disk.
          </p>
        </div>

        <SignUpForm githubEnabled={isGithubEnabled()} />
      </div>
    </div>
  );
}
