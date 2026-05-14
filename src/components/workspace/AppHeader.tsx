"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Database, LogOut, Settings as SettingsIcon } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/workspace/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/ui/cn";

const TABS = [
  { href: "/connections", label: "Connections", icon: Database, match: /^\/connections/ },
  { href: "/settings", label: "Settings", icon: SettingsIcon, match: /^\/settings/ },
];

export function AppHeader() {
  const pathname = usePathname() ?? "";
  const { data: session } = useSession();
  return (
    <header className="sticky top-0 z-30 border-b hairline bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/connections"
            aria-label="Suparbase home"
            className="inline-flex shrink-0 transition-colors hover:text-accent"
          >
            <Wordmark size="md" />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Account">
            {TABS.map((t) => {
              const isActive = t.match.test(pathname);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-accent/10 text-fg"
                      : "text-fg-muted hover:bg-bg-raised hover:text-fg",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <t.icon
                    className={cn("h-3.5 w-3.5", isActive ? "text-accent" : "text-fg-muted")}
                    aria-hidden
                  />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="overflow-hidden rounded-full border hairline p-0"
                  aria-label="Account menu"
                >
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.user.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-center font-mono text-xs">
                      {(session.user.name ?? session.user.email ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-xs">
                  <div className="truncate font-medium text-fg">{session.user.name}</div>
                  <div className="truncate text-fg-faint">{session.user.email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/connections">All connections</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/ai">AI assistance</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                  <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
