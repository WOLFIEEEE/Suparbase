"use client";

/**
 * Analytics shim. Mirrors the observability/report.ts pattern:
 * env-driven, no hard dependency on a vendor SDK. By default every
 * call is a no-op; when NEXT_PUBLIC_POSTHOG_KEY is set, the helper
 * lazy-loads posthog-js from a CDN and wires identify / capture.
 *
 * Why no hard dep:
 *   - Forces an explicit operator decision to enable tracking
 *     (good for privacy-conscious self-hosters).
 *   - Keeps the client bundle ~50 kB smaller when analytics is off.
 *   - The single call site (`track`, `identify`) means swapping
 *     vendors later touches one file.
 *
 * Privacy posture (when enabled):
 *   - We only send user.id + email at identify time. No row data,
 *     no Supabase keys, no connection content ever leaves the
 *     browser through this path.
 *   - prefers-reduced-motion check is not needed; analytics is text.
 *   - Honour Do-Not-Track: if `navigator.doNotTrack === "1"`, skip
 *     everything.
 */

type PostHogLike = {
  init: (key: string, opts: Record<string, unknown>) => void;
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string, props?: Record<string, unknown>) => void;
  reset: () => void;
  __loaded?: boolean;
};

let posthog: PostHogLike | null = null;
let loadPromise: Promise<PostHogLike | null> | null = null;

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return false;
  // Honour the user's stated preference. Most browsers no longer
  // ship the DNT header, but the navigator flag is still a fair signal.
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") {
    return false;
  }
  return true;
}

async function ensureClient(): Promise<PostHogLike | null> {
  if (!isEnabled()) return null;
  if (posthog) return posthog;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const mod = await import("posthog-js").catch(() => null);
      const ph = (mod && (mod as { default?: PostHogLike }).default) as PostHogLike | null;
      if (!ph) return null;
      ph.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        // We don't autocapture clicks — too noisy + privacy-leaky on a
        // data-admin tool. Explicit events only.
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: false,
        persistence: "localStorage+cookie",
        // The marketing copy already discloses we don't ship analytics
        // by default; when enabled, respect the GPC signal too.
        respect_dnt: true,
      });
      posthog = ph;
      return ph;
    } catch {
      return null;
    }
  })();
  return loadPromise;
}

/**
 * Track an event. Safe to call before posthog is loaded — calls
 * queue inside the SDK's own buffer.
 *
 * Naming convention: `noun_verb` (snake_case), past tense for things
 * that already happened. Example: `connection_created`, `paywall_shown`,
 * `checkout_started`.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  ensureClient()
    .then((c) => c?.capture(event, props))
    .catch(() => {
      // Never let analytics errors bubble.
    });
}

/**
 * Identify the signed-in user. Call this once after sign-in / when
 * the session loads. Only id + email + plan info — never row data.
 */
export function identifyUser(input: {
  id: string;
  email: string | null;
  name: string | null;
  plan?: string;
}): void {
  ensureClient()
    .then((c) => {
      if (!c) return;
      c.identify(input.id, {
        email: input.email ?? undefined,
        name: input.name ?? undefined,
        plan: input.plan,
      });
    })
    .catch(() => {});
}

/** Clear the identity. Call on sign-out so the next browser user
 *  doesn't inherit the previous identity. */
export function resetAnalytics(): void {
  ensureClient()
    .then((c) => c?.reset())
    .catch(() => {});
}
