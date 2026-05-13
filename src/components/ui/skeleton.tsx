import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse-soft rounded bg-bg-raised", className)}
      {...props}
    />
  );
}
