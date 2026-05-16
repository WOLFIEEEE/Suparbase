"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Github,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/ui/cn";

interface Props {
  githubEnabled: boolean;
  error?: string | null;
}

export function SignInForm({ githubEnabled, error }: Props) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/connections";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
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
        setSubmitting(false);
        return;
      }
      // Full navigation forces the server to re-render the protected
      // route with the freshly-set session cookie. router.replace would
      // race against Next's prefetch cache and bounce us back to /signin.
      window.location.assign(next);
    } catch {
      setFormError("Sign-in failed. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label
            htmlFor="signin-email"
            className="text-[11px] uppercase tracking-[0.16em] text-fg-faint"
          >
            Email
          </Label>
          <Input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="you@company.com"
            className="!font-sans text-base sm:text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="signin-password"
              className="text-[11px] uppercase tracking-[0.16em] text-fg-faint"
            >
              Password
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="cursor-help text-[10px] uppercase tracking-wider text-fg-faint hover:text-fg focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Forgot?
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Self-service password reset isn&apos;t wired up yet: contact your admin.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="relative">
            <Input
              id="signin-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className={cn(
                "absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5",
                "text-fg-faint hover:bg-bg-sunken hover:text-fg",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              )}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={submitting || githubLoading || !email.trim() || !password}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </Button>
      </form>

      {githubEnabled && (
        <>
          <Divider label="or continue with" />
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => {
              setGithubLoading(true);
              void signIn("github", { callbackUrl: next });
            }}
            disabled={submitting || githubLoading}
          >
            {githubLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Github className="h-4 w-4" aria-hidden />
            )}
            GitHub
          </Button>
        </>
      )}

      <p className="text-center text-sm text-fg-muted">
        New here?{" "}
        <Link
          href={`/signup${next !== "/connections" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative my-2 flex items-center">
      <span className="flex-1 border-t hairline" aria-hidden />
      <span className="px-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
        {label}
      </span>
      <span className="flex-1 border-t hairline" aria-hidden />
    </div>
  );
}
