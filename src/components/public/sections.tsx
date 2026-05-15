import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/ui/cn";

// ---------------------------------------------------------------------------
// Page shell, consistent vertical rhythm across every public page
// ---------------------------------------------------------------------------

export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-5xl px-6 py-16 md:py-24", className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageHeader, eyebrow + headline + subtitle
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("space-y-4", className)}>
      {eyebrow && (
        <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-fg-faint">
          <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-accent" />
          {eyebrow}
        </div>
      )}
      <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl md:text-5xl">{title}</h1>
      {subtitle && (
        <p className="max-w-2xl text-base leading-relaxed text-fg-muted md:text-lg">{subtitle}</p>
      )}
      {actions && <div className="flex flex-wrap items-center gap-3 pt-2">{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// SectionHeading, for sub-sections within a page
// ---------------------------------------------------------------------------

interface SectionHeadingProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({ eyebrow, title, subtitle, align = "left", className }: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "space-y-2",
        align === "center" && "mx-auto max-w-2xl text-center",
        className,
      )}
    >
      {eyebrow && (
        <div
          className={cn(
            "text-[10px] uppercase tracking-[0.22em] text-fg-faint",
            align === "center" && "inline-block",
          )}
        >
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-2xl leading-tight md:text-3xl">{title}</h2>
      {subtitle && (
        <p className="max-w-2xl text-sm leading-relaxed text-fg-muted md:text-base">{subtitle}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeatureCard, used on /features and /docs hubs
// ---------------------------------------------------------------------------

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  tone?: "default" | "accent";
}

export function FeatureCard({ icon: Icon, title, body, href, tone = "default" }: FeatureCardProps) {
  const inner = (
    <div
      className={cn(
        "group relative h-full rounded-lg border hairline bg-bg-raised p-5 transition-colors",
        href && "hover:border-line-strong hover:bg-bg-raised/90",
        tone === "accent" && "border-accent/40",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-md border hairline",
            tone === "accent" ? "border-accent/40 bg-accent/10" : "bg-bg-sunken",
          )}
        >
          <Icon className={cn("h-4 w-4", tone === "accent" ? "text-accent" : "text-fg-muted")} aria-hidden />
        </span>
        <h3 className="font-display text-base leading-tight">{title}</h3>
        {href && (
          <ArrowRight
            className="ml-auto h-3.5 w-3.5 shrink-0 text-fg-faint transition-colors group-hover:text-accent"
            aria-hidden
          />
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ---------------------------------------------------------------------------
// CTABand, the "ready to ship?" footer band on most pages
// ---------------------------------------------------------------------------

interface CTABandProps {
  title: React.ReactNode;
  body?: React.ReactNode;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}

export function CTABand({ title, body, primary, secondary }: CTABandProps) {
  return (
    <section className="border-t hairline bg-bg-raised/30">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-14 md:flex-row md:items-center md:justify-between md:gap-12 md:py-20">
        <div className="space-y-2">
          <h2 className="font-display text-2xl leading-tight md:text-3xl">{title}</h2>
          {body && <p className="max-w-xl text-sm text-fg-muted md:text-base">{body}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primary && (
            <Link
              href={primary.href}
              className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
            >
              {primary.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prose, typography reset for long-form pages (docs, privacy, terms)
// ---------------------------------------------------------------------------

export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "space-y-4 text-sm leading-relaxed text-fg-muted md:text-[15px]",
        "[&_h2]:font-display [&_h2]:text-xl [&_h2]:leading-tight [&_h2]:text-fg [&_h2]:mt-10 [&_h2]:mb-2 md:[&_h2]:text-2xl",
        "[&_h3]:font-display [&_h3]:text-lg [&_h3]:leading-tight [&_h3]:text-fg [&_h3]:mt-6 [&_h3]:mb-1.5",
        "[&_p]:max-w-3xl",
        "[&_ul]:max-w-3xl [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5",
        "[&_ol]:max-w-3xl [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5",
        "[&_li]:leading-relaxed",
        "[&_code]:rounded [&_code]:bg-bg-sunken [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-fg",
        "[&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline",
        "[&_strong]:text-fg [&_strong]:font-semibold",
        className,
      )}
    >
      {children}
    </div>
  );
}
