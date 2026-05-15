import Link from "next/link";
import { Shield } from "lucide-react";
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
          <div className="flex items-center gap-2 text-[11px] text-fg-faint">
            <span
              aria-hidden
              className="relative inline-flex h-2 w-2"
            >
              <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-40" />
              <span className="relative inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent))]" />
            </span>
            <span className="text-fg-muted">Suparbase</span>
            <span aria-hidden>·</span>
            <span>encrypted at rest · server-side proxy</span>
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
            <Shield className="h-3 w-3 text-accent" aria-hidden />
            <span className="font-mono">v{SITE.version}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
