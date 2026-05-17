"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  token: string;
  email: string;
}

type State =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "signing-in" }
  | { kind: "error"; message: string };

const MIN_PW = 12;

export function WelcomeClaimForm({ token, email }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "saving" || state.kind === "signing-in") return;
    if (password.length < MIN_PW) {
      setState({
        kind: "error",
        message: `Password must be at least ${MIN_PW} characters.`,
      });
      return;
    }
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/account/claim-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        reason?: string;
      };
      if (!res.ok || !data.ok) {
        setState({
          kind: "error",
          message: data.message ?? "Could not claim your account.",
        });
        return;
      }
      // Sign in via NextAuth credentials. `redirect: false` lets us
      // route to the post-signin destination ourselves.
      setState({ kind: "signing-in" });
      const signin = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (signin?.error) {
        setState({
          kind: "error",
          message:
            "Password saved, but signing you in failed. Try signing in manually.",
        });
        return;
      }
      router.push("/connections");
      router.refresh();
    } catch (err) {
      setState({
        kind: "error",
        message: (err as Error).message ?? "Network error.",
      });
    }
  }

  const busy = state.kind === "saving" || state.kind === "signing-in";

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-busy={busy}>
      <div className="rounded-md border border-accent/40 bg-accent/10 p-4 text-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-medium text-fg">Payment confirmed.</p>
            <p className="mt-1 text-xs text-fg-muted">
              Your subscription is attached to{" "}
              <span className="font-mono text-fg">{email}</span>. Pick a
              password to finish.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="welcome-password">Password</Label>
        <div className="relative">
          <Input
            id="welcome-password"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={MIN_PW}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            placeholder={`At least ${MIN_PW} characters`}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-fg-faint hover:bg-bg-sunken hover:text-fg"
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? (
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>
        <p className="text-[11px] text-fg-faint">
          Used to sign in at{" "}
          <Link href="/signin" className="text-accent hover:underline">
            /signin
          </Link>
          .
        </p>
      </div>

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {state.message}
        </div>
      )}

      <Button type="submit" disabled={busy} aria-busy={busy} className="w-full">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {state.kind === "signing-in" ? "Signing you in…" : "Saving password…"}
          </>
        ) : (
          <>
            <KeyRound className="h-4 w-4" aria-hidden />
            Set password and sign in
          </>
        )}
      </Button>
    </form>
  );
}
