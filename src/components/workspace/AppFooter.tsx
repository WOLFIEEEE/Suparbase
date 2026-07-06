import Link from "next/link";
import { Lock, Server, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SITE } from "@/lib/seo/site";
import { cn } from "@/lib/ui/cn";

interface Props {
  /**
   * `wide` constrains content to `max-w-7xl` (workspace pages).
   * `narrow` constrains to `max-w-6xl` (account pages).
   * `bare` applies no max-width: caller controls layout.
   */
  width?: "wide" | "narrow" | "bare";
  className?: string;
}

const FOOTER_LINKS = [
  { label: "Docs", href: "/docs" },
  { label: "Changelog", href: "/changelog" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

/**
 * Footer for authenticated pages (account + workspace). Designed to match
 * the AuthShell footer language: live-status dot, resource link row,
 * version + licence line. Sits below page content with a clear divider.
 */
export function AppFooter({ width = "narrow", className }: Props) {
  const inner =
    width === "wide" ? "max-w-7xl" : width === "narrow" ? "max-w-6xl" : "";
  return (
    <footer
      className={cn(
        "mt-16 border-t hairline bg-bg-raised/30",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto w-full px-6 py-6",
          inner,
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-fg-faint">
            <span className="inline-flex items-center gap-1.5 font-medium text-fg-muted">
              <Logo className="h-4 w-4" aria-hidden />
              Suparbase
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Encrypted at rest
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" aria-hidden />
              Server-side proxy
            </span>
          </div>
          <nav
            aria-label="App footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-fg-muted"
          >
            {FOOTER_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition-colors hover:text-fg"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t hairline pt-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
          <span>
            © {new Date().getFullYear()} Suparbase · All rights reserved
          </span>
          <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono">v{SITE.version}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
