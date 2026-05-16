"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import { cn } from "@/lib/ui/cn";

interface NavLinkDef {
  href: string;
  label: string;
  /** When true, hide this link for signed-in users (they manage billing in /settings/billing). */
  hideWhenSignedIn?: boolean;
}

const NAV_LINKS: readonly NavLinkDef[] = [
  { href: "/features", label: "Features" },
  { href: "/use-cases", label: "Use cases" },
  { href: "/pricing", label: "Pricing", hideWhenSignedIn: true },
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
];

interface Props {
  /** When the consumer already has a session, render "Open workspace" instead of sign-in/sign-up. */
  isSignedIn?: boolean;
}

export function PublicNav({ isSignedIn = false }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navLinks = NAV_LINKS.filter((l) => !(isSignedIn && l.hideWhenSignedIn));

  return (
    <header className="sticky top-0 z-40 border-b hairline bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" aria-label="Suparbase home" className="inline-flex shrink-0 items-center">
          <Wordmark size="md" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ href, label }) => (
            <NavLink key={href} href={href} active={pathname === href || pathname.startsWith(href + "/")}>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          <ThemeToggle />
          {isSignedIn ? (
            <Link
              href="/connections"
              className="ml-1 inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
            >
              Open workspace
            </Link>
          ) : (
            <>
              <Link
                href="/signin"
                className="inline-flex h-9 items-center rounded px-3 text-sm text-fg-muted hover:bg-bg-raised hover:text-fg"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="ml-1 inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle menu"
            className="rounded p-2 text-fg-muted hover:bg-bg-raised hover:text-fg"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t hairline bg-bg md:hidden">
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-6 py-3" aria-label="Primary mobile">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded px-2 py-2 text-sm text-fg-muted hover:bg-bg-raised hover:text-fg"
              >
                {label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-2 border-t hairline pt-3">
              {isSignedIn ? (
                <Link
                  href="/connections"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg"
                >
                  Open workspace
                </Link>
              ) : (
                <>
                  <Link
                    href="/signin"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-md border hairline px-3 text-sm text-fg"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg"
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative inline-flex h-9 items-center rounded px-3 text-sm transition-colors",
        active ? "text-fg" : "text-fg-muted hover:text-fg",
      )}
      aria-current={active ? "page" : undefined}
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-3 -bottom-px h-px bg-accent"
        />
      )}
    </Link>
  );
}
