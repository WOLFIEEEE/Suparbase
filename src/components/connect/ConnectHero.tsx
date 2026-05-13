import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

export function ConnectHero() {
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
      tl.to("[data-anim='eyebrow']", { opacity: 1, y: 0, duration: 0.5 })
        .to("[data-anim='headline'] .word", { opacity: 1, y: 0, duration: 0.8, stagger: 0.05 }, "-=0.2")
        .to("[data-anim='tagline']", { opacity: 1, y: 0, duration: 0.6 }, "-=0.4")
        .to("[data-anim='form']", { opacity: 1, y: 0, duration: 0.6 }, "-=0.3");
    },
    { scope: root, dependencies: [reduced] },
  );

  const words = "Your Supabase. Auto-admin'd.".split(" ");

  return (
    <div ref={root} className="space-y-6">
      <div data-anim="eyebrow" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-fg-muted">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse-soft" aria-hidden />
        client-only · no signup · no install
      </div>
      <h1
        data-anim="headline"
        className="font-display text-display-xl leading-none"
      >
        {words.map((w, i) => (
          <span key={i} className="inline-block overflow-hidden align-bottom pr-[0.25em]">
            <span className="word inline-block">
              {w === "Auto-admin'd." ? (
                <>
                  <span className="text-accent">Auto-admin</span>
                  <span>'d.</span>
                </>
              ) : (
                w
              )}
            </span>
          </span>
        ))}
      </h1>
      <p
        data-anim="tagline"
        className="max-w-xl text-base text-fg-muted sm:text-lg"
      >
        Paste a project URL and an API key. We introspect your schema and hand you
        a working admin dashboard — tables, forms, foreign keys, the lot.
      </p>
    </div>
  );
}
