"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  breadcrumbs?: Crumb[];
  title: string;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  breadcrumbs,
  title,
  subtitle,
  eyebrow,
  actions,
  tabs,
  className,
}: Props) {
  return (
    <header className={cn("space-y-4", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-fg-faint">
          {breadcrumbs.map((c, i) => {
            const last = i === breadcrumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                {c.href && !last ? (
                  <Link href={c.href} className="transition-colors hover:text-fg">
                    {c.label}
                  </Link>
                ) : (
                  <span className={last ? "text-fg-muted" : undefined}>{c.label}</span>
                )}
                {!last && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />}
              </span>
            );
          })}
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {eyebrow && (
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-fg-faint">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-display-md leading-[1.1] tracking-tight">{title}</h1>
          {subtitle && <div className="max-w-2xl text-sm text-fg-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {tabs && (
        <div className="-mb-px flex items-center gap-1 border-b hairline text-sm">
          {tabs}
        </div>
      )}
    </header>
  );
}

interface TabProps {
  href: string;
  active: boolean;
  children: React.ReactNode;
  count?: number | null;
}

export function PageHeaderTab({ href, active, children, count }: TabProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
        active
          ? "border-accent text-fg"
          : "border-transparent text-fg-muted hover:text-fg",
      )}
    >
      {children}
      {count != null && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0 text-[10px] tabular-nums",
            active ? "bg-accent/10 text-accent" : "bg-bg-sunken text-fg-faint",
          )}
        >
          {count.toLocaleString()}
        </span>
      )}
    </Link>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="surface rounded-md px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{label}</div>
      <div className="mt-1 font-display text-2xl leading-none tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-fg-muted">{hint}</div>}
    </div>
  );
}
