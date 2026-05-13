"use client";
import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export function LandingHero() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced) {
        gsap.set("[data-anim]", { opacity: 1, y: 0 });
        return;
      }
      gsap.set("[data-anim]", { opacity: 0, y: 24 });
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to("[data-anim='eyebrow']", { opacity: 1, y: 0, duration: 0.45 })
        .to("[data-anim='headline'] .word", { opacity: 1, y: 0, duration: 0.7, stagger: 0.05 }, "-=0.15")
        .to("[data-anim='tagline']", { opacity: 1, y: 0, duration: 0.55 }, "-=0.3")
        .to("[data-anim='cta']", { opacity: 1, y: 0, duration: 0.5 }, "-=0.3");
    },
    { scope: root, dependencies: [reduced] },
  );

  const words = "Admin for any Supabase. Key stays server-side.".split(" ");

  return (
    <div ref={root} className="space-y-6">
      <div
        data-anim="eyebrow"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-fg-muted"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse-soft" aria-hidden />
        nextauth · encrypted at rest · audited
      </div>
      <h1 data-anim="headline" className="font-display text-display-xl leading-none">
        {words.map((w, i) => (
          <span key={i} className="inline-block overflow-hidden align-bottom pr-[0.25em]">
            <span className="word inline-block">
              {w === "server-side." ? <span className="text-accent">{w}</span> : w}
            </span>
          </span>
        ))}
      </h1>
      <p data-anim="tagline" className="max-w-2xl text-base text-fg-muted sm:text-lg">
        Sign in, save your Supabase project, and run a real admin dashboard.
        Your API key is encrypted at rest and proxied — it never reaches the browser.
      </p>
      <div data-anim="cta" className="flex flex-wrap gap-3">
        <Link
          href="/signin"
          className="inline-flex h-11 items-center justify-center gap-2 rounded bg-accent px-5 font-medium text-accent-fg hover:bg-accent/90"
        >
          Sign in with GitHub <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <a
          href="https://github.com/supabase/supabase"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
        >
          Need a project? supabase.com →
        </a>
      </div>
    </div>
  );
}
