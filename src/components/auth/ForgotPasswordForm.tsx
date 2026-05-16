"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Forgot-password request form. POSTs to /api/account/forgot-password
 * and always shows a generic "if that email matches an account, the
 * link is on its way" confirmation — the server returns 200 whether
 * the email exists or not (enumeration defence).
 *
 * If the server returns `configured: false`, the deployment hasn't
 * wired Resend yet — we tell the user to email support directly so
 * they're not waiting on an email that will never arrive.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "sent"; emailConfigured: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setState({ kind: "idle" });
    try {
      const res = await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        configured?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setState({ kind: "error", message: data.message ?? `HTTP ${res.status}` });
        return;
      }
      setState({ kind: "sent", emailConfigured: data.configured !== false });
    } catch (err) {
      setState({
        kind: "error",
        message: (err as Error).message ?? "Network error.",
      });
    } finally {
      setPending(false);
    }
  }

  if (state.kind === "sent") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-accent/40 bg-accent/10 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-medium text-fg">
              {state.emailConfigured ? "Check your inbox." : "Email isn't configured."}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {state.emailConfigured ? (
                <>
                  If <span className="font-mono text-fg">{email}</span> matches an
                  account, a reset link is on its way. The link expires in one hour
                  and can only be used once.
                </>
              ) : (
                <>
                  This deployment doesn&apos;t have email delivery wired up. Email{" "}
                  <a href="mailto:contact@suparbase.com" className="text-accent hover:underline">
                    contact@suparbase.com
                  </a>{" "}
                  from the address on your account and an operator will reset it
                  manually.
                </>
              )}
            </p>
          </div>
        </div>
        <p className="text-xs text-fg-faint">
          Didn&apos;t get it after 5 minutes? Check spam, then{" "}
          <button
            type="button"
            onClick={() => setState({ kind: "idle" })}
            className="text-accent hover:underline"
          >
            try again
          </button>
          .
        </p>
        <Link href="/signin" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowRight className="h-3 w-3 rotate-180" aria-hidden />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="forgot-email" className="text-[11px] uppercase tracking-[0.16em] text-fg-faint">
          Email
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
          <Input
            id="forgot-email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="pl-9"
          />
        </div>
      </div>

      {state.kind === "error" && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          {state.message}
        </div>
      )}

      <Button type="submit" disabled={pending || email.trim().length < 3} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
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
