import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b hairline pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-display-md text-fg">{title}</h1>
        <div className="mt-1.5 text-sm leading-6 text-fg-muted">{description}</div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function AdminMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneClass = {
    neutral: "bg-accent/10 text-accent",
    ok: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    warn: "bg-warn/12 text-warn-fg dark:text-warn",
    danger: "bg-danger/10 text-danger",
  }[tone];
  return (
    <article className="min-w-0 rounded-lg border hairline bg-bg-raised p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">
          {label}
        </p>
        <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md", toneClass)}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl tabular-nums text-fg">{value}</p>
      {detail && <p className="mt-1 truncate text-[11px] text-fg-faint">{detail}</p>}
    </article>
  );
}

export function AdminStatus({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone === "ok" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
        tone === "warn" && "bg-warn/12 text-warn-fg dark:text-warn",
        tone === "danger" && "bg-danger/10 text-danger",
        tone === "neutral" && "bg-bg text-fg-muted",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed hairline bg-bg-raised/40 px-5 py-10 text-center">
      <span className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-bg text-fg-faint">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <h2 className="mt-3 text-sm font-semibold text-fg">{title}</h2>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-fg-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
