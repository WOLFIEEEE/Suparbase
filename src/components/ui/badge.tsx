import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ui/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
  {
    variants: {
      tone: {
        neutral: "border-line bg-bg-raised text-fg-muted",
        accent: "border-accent/40 bg-accent/10 text-accent",
        danger: "border-danger/40 bg-danger/10 text-danger",
        warn: "border-warn/40 bg-warn/10 text-warn",
        outline: "border-line-strong bg-transparent text-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
