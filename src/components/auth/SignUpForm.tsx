"use client";
import { useMemo, useState } from "react";
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
import { cn } from "@/lib/ui/cn";

interface Props {
  githubEnabled: boolean;
}

interface SignupError {
  category?: string;
  message?: string;
  field?: string;
}

const MIN_PASSWORD_LENGTH = 12;

export function SignUpForm({ githubEnabled }: Props) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/connections";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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
        setFormError("Account created: sign in to continue.");
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
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label
            htmlFor="signup-name"
            className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-fg-faint"
          >
            <span>Name</span>
            <span className="normal-case tracking-normal text-fg-faint">(optional)</span>
          </Label>
          <Input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
            placeholder="What should we call you?"
            className="!font-sans text-base sm:text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="signup-email"
            className="text-[11px] uppercase tracking-[0.16em] text-fg-faint"
          >
            Email
          </Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={fieldError?.field === "email"}
            placeholder="you@company.com"
            className={cn(
              "!font-sans text-base sm:text-sm",
              fieldError?.field === "email" && "border-danger/60",
            )}
          />
          {fieldError?.field === "email" && (
            <p className="text-[11px] text-danger">{fieldError.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="signup-password"
            className="text-[11px] uppercase tracking-[0.16em] text-fg-faint"
          >
            Password
          </Label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-invalid={fieldError?.field === "password"}
              placeholder="••••••••••••"
              className={cn(
                "pr-10",
                fieldError?.field === "password" && "border-danger/60",
              )}
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
          <PasswordStrengthMeter
            strength={strength}
            password={password}
            error={fieldError?.field === "password" ? fieldError.message : null}
            satisfied={passwordValid}
          />
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
          disabled={submitting || githubLoading || !emailValid || !passwordValid}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Creating account…
            </>
          ) : (
            <>
              Create account
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
        Already have an account?{" "}
        <Link
          href={`/signin${next !== "/connections" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tone: "danger" | "warn" | "accent";
}

function scorePassword(pw: string): Strength {
  if (pw.length === 0) return { score: 0, label: ":", tone: "danger" };
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  // Cap at 4.
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { score: clamped, label: "Too short", tone: "danger" };
  }
  if (clamped <= 1) return { score: clamped, label: "Weak", tone: "danger" };
  if (clamped === 2) return { score: clamped, label: "Okay", tone: "warn" };
  if (clamped === 3) return { score: clamped, label: "Good", tone: "accent" };
  return { score: clamped, label: "Strong", tone: "accent" };
}

function PasswordStrengthMeter({
  strength,
  password,
  error,
  satisfied,
}: {
  strength: Strength;
  password: string;
  error: string | null;
  satisfied: boolean;
}) {
  // Hide the meter completely before the user has typed anything.
  if (password.length === 0) {
    return (
      <p className="text-[11px] text-fg-faint">
        At least {MIN_PASSWORD_LENGTH} characters. Longer is better.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex h-1 gap-1" role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength.score}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-full transition-colors duration-200",
              i < strength.score
                ? strength.tone === "danger"
                  ? "bg-danger"
                  : strength.tone === "warn"
                  ? "bg-warn"
                  : "bg-accent"
                : "bg-line/60",
            )}
          />
        ))}
      </div>
      <p
        className={cn(
          "text-[11px]",
          error
            ? "text-danger"
            : satisfied
            ? "text-accent"
            : strength.tone === "danger"
            ? "text-danger"
            : strength.tone === "warn"
            ? "text-warn"
            : "text-fg-muted",
        )}
      >
        {error ??
          (satisfied
            ? `${strength.label}: looks good.`
            : `${strength.label} · ${Math.max(0, MIN_PASSWORD_LENGTH - password.length)} more character${MIN_PASSWORD_LENGTH - password.length === 1 ? "" : "s"} to go.`)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

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
