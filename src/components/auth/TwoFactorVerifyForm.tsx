"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ArrowRight, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  next: string;
}

/**
 * Two-factor verify form. Submitted at /signin/2fa as the gate
 * between password-success and the rest of the app. Supports both
 * regular 6-digit TOTP codes and 10-character recovery codes (one of
 * the 10 generated at enable time, redeemable once).
 *
 * On success the API endpoint sets the signed `suparbase-mfa-ok`
 * cookie and we navigate to the original `?next=` destination.
 */
export function TwoFactorVerifyForm({ next }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, recovery: mode === "recovery" }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? `HTTP ${res.status}`);
        return;
      }
      // Hard navigate so middleware re-evaluates with the new cookie.
      window.location.href = isSafeNext(next) ? next : "/connections";
    } catch (err) {
      setError((err as Error).message ?? "Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="mfa-code" className="text-[11px] uppercase tracking-[0.16em] text-fg-faint">
          {mode === "totp" ? "Authenticator code" : "Recovery code"}
        </Label>
        <div className="relative">
          {mode === "totp" ? (
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          ) : (
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          )}
          <Input
            id="mfa-code"
            type="text"
            inputMode={mode === "totp" ? "numeric" : "text"}
            pattern={mode === "totp" ? "[0-9]*" : undefined}
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={mode === "totp" ? "123456" : "AB12-CD34-EF"}
            maxLength={mode === "totp" ? 6 : 20}
            className="pl-9 font-mono"
          />
        </div>
        <p className="text-[11px] text-fg-faint">
          {mode === "totp"
            ? "6-digit code from your authenticator app. Codes refresh every 30 seconds."
            : "One of the 10 recovery codes you saved when enabling 2FA. Each works once."}
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          {error}
        </div>
      )}

      <Button type="submit" disabled={pending || code.trim().length < 6} className="w-full">
        {pending ? "Verifying…" : "Verify"}
        {!pending && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
      </Button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "totp" ? "recovery" : "totp"));
            setCode("");
            setError(null);
          }}
          className="text-fg-muted hover:text-fg"
        >
          {mode === "totp" ? "Use a recovery code" : "Use an authenticator code"}
        </button>
        <button
          type="button"
          onClick={() => {
            void signOut({ callbackUrl: "/" });
            router.refresh();
          }}
          className="text-fg-faint hover:text-fg"
        >
          Cancel sign-in
        </button>
      </div>
    </form>
  );
}

/** Only follow same-origin paths in `?next=`. */
function isSafeNext(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}
