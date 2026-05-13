"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Eye, EyeOff, Github, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  githubEnabled: boolean;
  error?: string | null;
}

export function SignInForm({ githubEnabled, error }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/connections";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(error ?? null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (!res || res.error) {
        setFormError("Invalid email or password.");
        return;
      }
      router.replace(next);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signin-email">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3 w-3" aria-hidden />
              Email
            </span>
          </Label>
          <Input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="signin-password">Password</Label>
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="text-xs text-fg-muted hover:text-fg"
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <span className="inline-flex items-center gap-1"><EyeOff className="h-3 w-3" /> hide</span>
              ) : (
                <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> show</span>
              )}
            </button>
          </div>
          <Input
            id="signin-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {formError && (
          <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? "Signing in…" : (
            <>
              Sign in <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </Button>
      </form>

      {githubEnabled && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <span className="w-full border-t hairline" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-bg-raised px-2 text-fg-faint">or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => signIn("github", { callbackUrl: next })}
          >
            <Github className="h-4 w-4" aria-hidden />
            Continue with GitHub
          </Button>
        </>
      )}

      <p className="text-center text-sm text-fg-muted">
        New here?{" "}
        <Link href={`/signup${next !== "/connections" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
