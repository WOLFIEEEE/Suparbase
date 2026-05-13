"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight, Activity, FileText, Mail, MoreHorizontal, ShieldCheck, Users } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/ui/cn";

/**
 * v1.0 hero. Designed around the constitution's Principle II ("motion
 * serves comprehension"): every motion teaches something.
 *
 *  1. Eyebrow fades in.
 *  2. Headline reveals word-by-word via a translate-from-below mask
 *     (proper clip-based reveal, not just opacity). The accent word
 *     ("Supabase") is followed by a terminal caret that blinks — says
 *     "this is software" without literal terminal chrome.
 *  3. Subtitle + CTAs fade up.
 *  4. Three product preview cards are "dealt" in from below with a
 *     slight rotation, then settle. Each card mirrors a real archetype
 *     from the product (Users / Content / Logs), so the user sees
 *     exactly what they'll get the moment they sign in.
 *  5. Live signals continue subtly: the users status pulses; the log
 *     timestamp ticks up; both honour prefers-reduced-motion.
 */
export function LandingHero() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      const selectors = {
        eyebrow: "[data-anim='eyebrow']",
        words: "[data-anim='headline'] .word",
        caret: "[data-anim='caret']",
        tagline: "[data-anim='tagline']",
        cta: "[data-anim='cta']",
        cards: "[data-anim='card']",
      };

      // Pre-set everything to its hidden state. useGSAP runs in
      // useLayoutEffect so this fires before the browser paints — no
      // flash of unstyled content.
      gsap.set(selectors.words, { yPercent: 115, opacity: 0 });
      gsap.set(selectors.caret, { opacity: 0, scaleY: 0.6 });
      gsap.set(selectors.cards, { opacity: 0, y: 32, rotate: 0 });

      if (reduced) {
        gsap.set(
          [
            selectors.eyebrow,
            selectors.words,
            selectors.caret,
            selectors.tagline,
            selectors.cta,
            selectors.cards,
          ],
          { opacity: 1, y: 0, yPercent: 0, scaleY: 1, rotate: 0, clearProps: "willChange,transform" },
        );
        return;
      }

      // Apply per-card initial rotation now so they're tilted before
      // the entrance plays.
      gsap.utils.toArray<HTMLElement>(selectors.cards).forEach((el) => {
        const rot = Number(el.dataset.initialRotate ?? "0");
        gsap.set(el, { rotate: rot });
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(selectors.eyebrow, { opacity: 1, y: 0, duration: 0.5 })
        .to(
          selectors.words,
          { yPercent: 0, opacity: 1, duration: 0.85, stagger: 0.04, ease: "power4.out" },
          "-=0.2",
        )
        .to(selectors.caret, { opacity: 1, scaleY: 1, duration: 0.3 }, "-=0.3")
        .to(selectors.tagline, { opacity: 1, y: 0, duration: 0.55 }, "-=0.4")
        .to(selectors.cta, { opacity: 1, y: 0, duration: 0.5 }, "-=0.35")
        // Cards: dealt in from below with stagger + small rotation that settles.
        .to(
          selectors.cards,
          {
            opacity: 1,
            y: 0,
            rotate: 0,
            duration: 0.7,
            stagger: 0.11,
            ease: "back.out(1.4)",
          },
          "-=0.3",
        );
    },
    { scope: root, dependencies: [reduced] },
  );

  // Hidden initial states (inline so SSR matches and there's no flash).
  const hidden = { opacity: 0, transform: "translateY(22px)" } as const;

  // Headline structure: line 1 + accent line + closing word + caret.
  // Splitting per-word so each one can mask-reveal independently.
  const line1 = ["Admin", "for", "any"];
  const line2Word = "Supabase";
  const line3Word = "project.";

  return (
    <div ref={root} className="space-y-10">
      {/* Eyebrow */}
      <div
        data-anim="eyebrow"
        style={hidden}
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-fg-muted"
      >
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50" aria-hidden />
          <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        </span>
        live · encrypted at rest · audited
      </div>

      {/* Headline — three lines, each word masked + revealed. */}
      <h1
        data-anim="headline"
        className="font-display text-display-xl leading-[1.02] tracking-tight"
      >
        <span className="block">
          {line1.map((w, i) => (
            <WordMask key={`l1-${i}`} word={w} trailingSpace />
          ))}
        </span>
        <span className="block text-accent">
          <WordMask word={line2Word} trailingSpace />
          <span className="text-fg">
            <WordMask word={line3Word} />
          </span>
          {/* Terminal caret — visual cue that this is software, not a brochure. */}
          <span
            data-anim="caret"
            aria-hidden
            className="ml-1 inline-block h-[0.85em] w-[0.12em] translate-y-[0.1em] animate-blink bg-accent align-baseline"
            style={{ transformOrigin: "bottom" }}
          />
        </span>
      </h1>

      {/* Subtitle */}
      <p
        data-anim="tagline"
        style={hidden}
        className="max-w-2xl text-base text-fg-muted sm:text-lg"
      >
        Sign in, save your Supabase project, and run a real admin dashboard.
        Your API key is encrypted at rest and proxied — it never reaches the browser.
      </p>

      {/* CTAs */}
      <div data-anim="cta" style={hidden} className="flex flex-wrap gap-3">
        <Link
          href="/signin"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-5 font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90 focus-visible:scale-[1.02]"
        >
          Sign in <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <a
          href="https://github.com/supabase/supabase"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-md border hairline px-5 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          Need a project? supabase.com →
        </a>
      </div>

      {/* Product preview cards — exact mock of what users see in the admin. */}
      <PreviewStack />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Word mask — `<span overflow-hidden>` containing `<span class="word">`
   that translates from below. Pre-renders hidden via inline style so SSR
   has no flash.
   ────────────────────────────────────────────────────────────────────── */

function WordMask({
  word,
  trailingSpace,
}: {
  word: string;
  trailingSpace?: boolean;
}) {
  return (
    <span className="inline-block overflow-hidden align-bottom pb-[0.06em]">
      <span className="word inline-block will-change-transform">
        {word}
        {trailingSpace ? " " : ""}
      </span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   PreviewStack — three product row cards (Users, Content, Logs).
   Each one mirrors the actual archetype's row UI, so the landing page
   bridges to the product without screenshots.
   ────────────────────────────────────────────────────────────────────── */

function PreviewStack() {
  return (
    <div className="mt-2 space-y-2">
      <PreviewCard delay={0} initialRotate={-1.5}>
        <UsersRow />
      </PreviewCard>
      <PreviewCard delay={1} initialRotate={0.8}>
        <ContentRow />
      </PreviewCard>
      <PreviewCard delay={2} initialRotate={-0.5}>
        <LogsRow />
      </PreviewCard>
    </div>
  );
}

function PreviewCard({
  initialRotate,
  children,
}: {
  delay: number;
  initialRotate: number;
  children: React.ReactNode;
}) {
  return (
    <div
      data-anim="card"
      data-initial-rotate={initialRotate}
      className="surface flex items-center gap-3 rounded-md p-3 opacity-0 will-change-transform"
    >
      {children}
    </div>
  );
}

function UsersRow() {
  return (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-sunken">
        <Users className="h-4 w-4 text-fg-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Sarah Chen</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
            <span className="relative inline-flex h-1 w-1">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" aria-hidden />
              <span className="relative h-1 w-1 rounded-full bg-accent" aria-hidden />
            </span>
            active
          </span>
        </div>
        <div className="flex items-center gap-3 truncate text-xs text-fg-muted">
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <Mail className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">sarah@acme.io</span>
          </span>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
        <ShieldCheck className="h-3 w-3" aria-hidden />
        admin
      </span>
      <MoreHorizontal className="h-4 w-4 text-fg-faint" aria-hidden />
    </>
  );
}

function ContentRow() {
  return (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-sunken">
        <FileText className="h-4 w-4 text-fg-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium">How we ship: a postmortem</span>
        </div>
        <div className="flex items-center gap-3 truncate text-xs text-fg-muted">
          <span className="truncate font-mono text-[11px]">/how-we-ship</span>
          <span>· by m. lee</span>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
        published
      </span>
      <MoreHorizontal className="h-4 w-4 text-fg-faint" aria-hidden />
    </>
  );
}

function LogsRow() {
  // Live-ish timestamp ticker — "12s" → "13s" → ... → "1m" → loops.
  const [seconds, setSeconds] = useState(12);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setSeconds((s) => (s >= 59 ? 12 : s + 1));
    }, 1000);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-sunken">
        <Activity className="h-4 w-4 text-fg-muted" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center rounded-full bg-bg-sunken px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            user.signed_in
          </span>
          <span className="truncate font-mono text-[11px] text-fg-faint">
            {"{ ip: \"203.0.113.7\", ua: \"Safari/17\" }"}
          </span>
        </div>
        <div className="flex items-center gap-3 truncate text-xs text-fg-muted">
          <span>by sarah</span>
          <span className={cn("font-mono tabular-nums text-fg-faint")}>· {seconds}s ago</span>
        </div>
      </div>
      <MoreHorizontal className="h-4 w-4 text-fg-faint" aria-hidden />
    </>
  );
}
