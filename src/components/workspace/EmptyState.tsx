import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded border hairline bg-bg-sunken px-6 py-16 text-center",
        className,
      )}
    >
      <h3 className="font-display text-2xl">{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
