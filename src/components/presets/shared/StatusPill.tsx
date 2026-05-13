"use client";
import { cn } from "@/lib/ui/cn";

const TONE_MAP: Record<string, { bg: string; fg: string }> = {
  active: { bg: "bg-accent/10", fg: "text-accent" },
  enabled: { bg: "bg-accent/10", fg: "text-accent" },
  published: { bg: "bg-accent/10", fg: "text-accent" },
  approved: { bg: "bg-accent/10", fg: "text-accent" },
  success: { bg: "bg-accent/10", fg: "text-accent" },
  done: { bg: "bg-accent/10", fg: "text-accent" },

  draft: { bg: "bg-line/40", fg: "text-fg-muted" },
  inactive: { bg: "bg-line/40", fg: "text-fg-muted" },
  pending: { bg: "bg-warn/10", fg: "text-warn" },
  processing: { bg: "bg-warn/10", fg: "text-warn" },

  banned: { bg: "bg-danger/10", fg: "text-danger" },
  suspended: { bg: "bg-danger/10", fg: "text-danger" },
  failed: { bg: "bg-danger/10", fg: "text-danger" },
  error: { bg: "bg-danger/10", fg: "text-danger" },
  rejected: { bg: "bg-danger/10", fg: "text-danger" },
};

export function StatusPill({ value, className }: { value: string; className?: string }) {
  const tone = TONE_MAP[value.toLowerCase()] ?? { bg: "bg-line/40", fg: "text-fg" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
        tone.bg,
        tone.fg,
        className,
      )}
    >
      {value}
    </span>
  );
}
