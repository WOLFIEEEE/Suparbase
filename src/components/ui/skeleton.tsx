import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("shimmer rounded", className)}
      {...props}
    />
  );
}
