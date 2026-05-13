"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Eye, EyeOff, Github, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  githubEnabled: boolean;
}

interface SignupError {
  category?: string;
  message?: string;
  field?: string;
}

export function SignUpForm({ githubEnabled }: Props) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/connections";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldError(null);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          password,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as SignupError | null;
        const msg = data?.message ?? "Could not create account.";
        if (data?.field) setFieldError({ field: data.field, message: msg });
        else setFormError(msg);
        setSubmitting(false);
        return;
      }
      // Account created. Immediately sign in via Credentials so the
      // user lands inside the workspace, not on /signin.
      const signin = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (!signin || signin.error) {
        // Surfacing as an error so they can manually sign in.
        setFormError("Account created — sign in to continue.");
        setSubmitting(false);
        window.location.assign(`/signin?next=${encodeURIComponent(next)}`);
        return;
      }
      // Full nav: lets the server re-render the protected route with
      // the freshly-set session cookie.
      window.location.assign(next);
    } catch {
      setFormError("Could not create account. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-name">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3 w-3" aria-hidden />
              Name (optional)
            </span>
          </Label>
          <Input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="signup-email">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3 w-3" aria-hidden />
              Email
            </span>
          </Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={fieldError?.field === "email"}
          />
          {fieldError?.field === "email" && (
            <p className="text-[11px] text-danger">{fieldError.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="signup-password">Password</Label>
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
            id="signup-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            aria-invalid={fieldError?.field === "password"}
          />
          {fieldError?.field === "password" ? (
            <p className="text-[11px] text-danger">{fieldError.message}</p>
          ) : (
            <p className="text-[11px] text-fg-faint">At least 12 characters.</p>
          )}
        </div>

        {formError && (
          <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={submitting}>
          {submitting ? "Creating account…" : (
            <>
              Create account <ArrowRight className="h-4 w-4" aria-hidden />
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
        Already have an account?{" "}
        <Link href={`/signin${next !== "/connections" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
