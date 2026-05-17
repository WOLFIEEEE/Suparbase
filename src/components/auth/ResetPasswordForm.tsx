"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  token: string;
}

const MIN_LENGTH = 12;

/**
 * Consume a single-use reset token + set a new password. On success
 * we redirect to /signin?reset=1 - the user has to sign in fresh
 * (we don't auto-create a session post-reset, that's a deliberate
 * step that prevents a half-compromised account from sliding through).
 */
export function ResetPasswordForm({ token }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN_LENGTH && confirm === password && !pending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        category?: string;
      };
      if (!res.ok) {
        setError(data.message ?? `HTTP ${res.status}`);
        return;
      }
      toast.success("Password updated. Sign in with the new one.");
      router.push("/signin?reset=1");
    } catch (err) {
      setError((err as Error).message ?? "Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="reset-password" className="text-[11px] uppercase tracking-[0.16em] text-fg-faint">
          New password
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input
            id="reset-password"
            type={show ? "text" : "password"}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_LENGTH} characters`}
            aria-invalid={tooShort}
            aria-describedby="reset-password-help"
            className="pl-9 pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-fg-faint hover:bg-bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
          </button>
        </div>
        <p
          id="reset-password-help"
          className={tooShort ? "text-[11px] text-danger" : "text-[11px] text-fg-faint"}
        >
          At least {MIN_LENGTH} characters. Mix in letters, numbers, and symbols for strength.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm" className="text-[11px] uppercase tracking-[0.16em] text-fg-faint">
          Confirm password
        </Label>
        <Input
          id="reset-confirm"
          type={show ? "text" : "password"}
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          aria-describedby="reset-confirm-help"
        />
        <p
          id="reset-confirm-help"
          className={mismatch ? "text-[11px] text-danger" : "text-[11px] text-fg-faint"}
        >
          {mismatch ? "Passwords don't match." : "Same password again, just so you don't typo it."}
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          {error}
          {error.toLowerCase().includes("expired") || error.toLowerCase().includes("used") ? (
            <p className="mt-2">
              <Link href="/forgot" className="underline hover:text-fg">
                Request a new link
              </Link>
            </p>
          ) : null}
        </div>
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {pending ? "Updating…" : "Set new password"}
        {!pending && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
      </Button>

      <p className="text-xs text-fg-faint">
        <Link href="/signin" className="hover:text-fg">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
