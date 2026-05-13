import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isGithubEnabled } from "@/server/auth";
import { SignInForm } from "@/components/auth/SignInForm";

interface SignInPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
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
  const { next, error } = await searchParams;
  if (session?.user) redirect(next ?? "/connections");

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div className="surface w-full max-w-md space-y-6 rounded p-8">
        <div className="space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-xs text-fg-muted hover:text-fg">
            ← back
          </Link>
          <h1 className="font-display text-display-md">Sign in</h1>
          <p className="text-sm text-fg-muted">
            Your saved Supabase keys stay encrypted on our servers — they never touch a browser.
          </p>
        </div>

        <SignInForm githubEnabled={isGithubEnabled()} error={mapError(error)} />

        <p className="text-[11px] text-fg-faint">
          By signing in you agree to a basic operator-side audit log of writes performed through your
          connections.
        </p>
      </div>
    </div>
  );
}
