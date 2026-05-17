"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/ui/cn";

interface Props {
  plan: "hosted";
  initialCadence?: "monthly" | "annual";
  /** Surfaced from the URL when Dodo redirects back after cancel. */
  cancelled?: boolean;
  /** Pricing copy, sourced from PLAN_LIMITS on the page. */
  pricing: {
    label: string;
    monthlyPriceFormatted: string;
    annualPriceFormatted: string;
    annualSupported: boolean;
    trialDays: number;
  };
}

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "error"; message: string; existsAt?: string };

export function GuestCheckoutForm({
  plan,
  initialCadence = "monthly",
  cancelled = false,
  pricing,
}: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"monthly" | "annual">(initialCadence);
  const [state, setState] = useState<State>(
    cancelled
      ? {
          kind: "error",
          message:
            "Looks like you cancelled the payment. No charge was made - you can try again any time.",
        }
      : { kind: "idle" },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "starting") return;
    setState({ kind: "starting" });
    try {
      const res = await fetch("/api/billing/guest-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          plan,
          cadence,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        category?: string;
        message?: string;
      };
      if (res.ok && data.checkoutUrl) {
        // Hand off to Dodo's hosted checkout.
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.category === "account_exists" || data.category === "already_subscribed") {
        setState({
          kind: "error",
          message:
            data.message ??
            "An account with this email already exists. Please sign in.",
          existsAt: `/signin?email=${encodeURIComponent(email.trim())}`,
        });
        return;
      }
      setState({
        kind: "error",
        message: data.message ?? `Request failed (HTTP ${res.status}).`,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: (err as Error).message ?? "Network error.",
      });
    }
  }

  const starting = state.kind === "starting";
  const cadenceLabel = cadence === "annual" ? "year" : "month";
  const priceShown =
    cadence === "annual"
      ? pricing.annualPriceFormatted
      : pricing.monthlyPriceFormatted;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate aria-busy={starting}>
      <div className="rounded-lg border hairline bg-bg-raised/40 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
              Suparbase {pricing.label}
            </p>
            <p className="mt-1 font-display text-2xl">
              {priceShown}
              <span className="ml-1 text-sm text-fg-muted">/ {cadenceLabel}</span>
            </p>
          </div>
          {pricing.annualSupported && (
            <CadenceToggle cadence={cadence} setCadence={setCadence} />
          )}
        </div>
        {pricing.trialDays > 0 && (
          <p className="mt-3 text-xs text-fg-muted">
            <strong className="text-fg">{pricing.trialDays}-day free trial.</strong>{" "}
            You won&rsquo;t be charged until {pricing.trialDays} days after
            the subscription starts.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="checkout-email">Work email</Label>
          <Input
            id="checkout-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={starting}
            placeholder="you@company.com"
            maxLength={254}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checkout-name">
            Display name <span className="text-fg-faint">(optional)</span>
          </Label>
          <Input
            id="checkout-name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={starting}
            placeholder="Ada Lovelace"
            maxLength={120}
          />
        </div>
      </div>

      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {state.message}
          {state.existsAt && (
            <>
              {" "}
              <Link
                href={state.existsAt}
                className="font-medium underline-offset-2 hover:underline"
              >
                Sign in →
              </Link>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={starting || !email} aria-busy={starting}>
          {starting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Redirecting to checkout…
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" aria-hidden />
              Continue to payment
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </Button>
        <p className="text-[11px] text-fg-faint">
          Already have an account?{" "}
          <Link href="/signin" className="text-accent hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-fg-faint">
        <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
        Payment is processed by Dodo Payments (PCI-DSS Level 1). Suparbase
        never sees your card details. By continuing you agree to our{" "}
        <Link href="/terms" className="underline-offset-2 hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline-offset-2 hover:underline">
          Privacy policy
        </Link>
        .
      </p>
    </form>
  );
}

function CadenceToggle({
  cadence,
  setCadence,
}: {
  cadence: "monthly" | "annual";
  setCadence: (c: "monthly" | "annual") => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing cadence"
      className="inline-flex shrink-0 rounded-md border hairline bg-bg p-0.5 text-xs"
    >
      {(["monthly", "annual"] as const).map((c) => {
        const selected = c === cadence;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setCadence(c)}
            className={cn(
              "rounded px-2.5 py-1 transition-colors",
              selected
                ? "bg-bg-raised text-fg shadow-sm"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {c === "annual" ? "Annual (save 17%)" : "Monthly"}
          </button>
        );
      })}
    </div>
  );
}
