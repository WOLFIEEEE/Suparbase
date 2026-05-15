"use client";

/**
 * A small "What do these mean?" disclosure for pages that use
 * jargon-y action labels (Sentry: Quarantine / Acknowledge / Resolve;
 * Agents: Undo session / closed / undo_partial). Native <details>
 * element so it Just Works without a state hook, and the disclosure
 * is keyboard-accessible by default.
 *
 * Open by default the first time, collapsed thereafter via
 * localStorage so the same user doesn't have to dismiss it every
 * visit. Falls back to "open" if localStorage is unavailable.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export interface Term {
  /** Word or short phrase the user will see in the UI (e.g. "Quarantine"). */
  word: string;
  /** One-line plain-English description. */
  body: ReactNode;
  /** Optional usage hint, rendered smaller. */
  hint?: ReactNode;
}

interface Props {
  /** Stable id used to remember dismiss state across visits. */
  storageKey: string;
  /** Card heading, e.g. "What do these mean?" */
  title?: string;
  /** Sub-heading shown next to the title. */
  subtitle?: string;
  terms: Term[];
}

export function TermsExplainer({ storageKey, title = "What do these mean?", subtitle, terms }: Props) {
  // SSR safety: default to open. Hydrate from localStorage after mount.
  const [open, setOpen] = useState(true);
  const hydrated = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(`suparbase.explainer.${storageKey}`);
      if (v === "closed") setOpen(false);
    } catch {
      /* localStorage unavailable, stay open */
    }
    hydrated.current = true;
  }, [storageKey]);

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const next = e.currentTarget.open;
    setOpen(next);
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(
        `suparbase.explainer.${storageKey}`,
        next ? "open" : "closed",
      );
    } catch {
      /* localStorage unavailable, nothing to do */
    }
  }

  return (
    <details
      open={open}
      onToggle={onToggle}
      className="group rounded-lg border hairline bg-bg-raised"
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span className="font-display">{title}</span>
        {subtitle && (
          <span className="ml-1 truncate text-xs text-fg-faint">{subtitle}</span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform",
            "group-open:rotate-180",
          )}
          aria-hidden
        />
      </summary>
      <div className="grid gap-3 border-t hairline px-4 py-3 sm:grid-cols-2">
        {terms.map((t) => (
          <div key={t.word} className="space-y-1">
            <div className="font-display text-sm">{t.word}</div>
            <div className="text-xs leading-relaxed text-fg-muted">{t.body}</div>
            {t.hint && (
              <div className="text-[11px] leading-relaxed text-fg-faint">{t.hint}</div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
