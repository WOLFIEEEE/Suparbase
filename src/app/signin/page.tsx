import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/server/auth";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignInPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const { next, error } = await searchParams;
  if (session?.user) redirect(next ?? "/connections");

  async function signInGitHub() {
    "use server";
    await signIn("github", { redirectTo: next ?? "/connections" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div className="surface w-full max-w-md space-y-6 rounded p-8">
        <div className="space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-xs text-fg-muted hover:text-fg">
            ← back
          </Link>
          <h1 className="font-display text-display-md">Sign in</h1>
          <p className="text-sm text-fg-muted">
            Suparbase uses GitHub for authentication. Your saved Supabase keys
            stay encrypted on our servers — they never touch a browser.
          </p>
        </div>

        {error && (
          <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            Sign-in failed. {error === "OAuthAccountNotLinked" && "An account with this email already exists with a different sign-in method."}
          </div>
        )}

        <form action={signInGitHub} className="space-y-2">
          <Button type="submit" className="w-full" size="lg">
            <Github className="h-4 w-4" aria-hidden />
            Continue with GitHub
          </Button>
        </form>

        <p className="text-[11px] text-fg-faint">
          By signing in you agree to a basic operator-side audit log of writes
          performed through your connections.
        </p>
      </div>
    </div>
  );
}
