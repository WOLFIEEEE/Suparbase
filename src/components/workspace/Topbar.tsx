"use client";
import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Menu, RefreshCw, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarNav } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import type { ConnectionSummary, KeyRole } from "@/lib/types/connection";

const ROLE_TONE: Record<KeyRole, "neutral" | "accent" | "warn" | "danger"> = {
  anon: "accent",
  authenticated: "accent",
  service_role: "danger",
  unknown: "warn",
};

const ROLE_LABEL: Record<KeyRole, string> = {
  anon: "anon",
  authenticated: "user",
  service_role: "service-role",
  unknown: "unknown",
};

export function Topbar({ connection }: { connection: ConnectionSummary }) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function refreshSchema() {
    qc.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[1] === connection.id,
    });
  }

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b hairline bg-bg px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </Button>
          <Link
            href={`/c/${connection.id}/settings`}
            className="flex items-center gap-2 truncate text-xs hover:text-fg"
            aria-label="Connection settings"
          >
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="truncate font-medium">{connection.name}</span>
            <span className="truncate font-mono text-fg-faint">· {connection.hostname}</span>
          </Link>
          <Badge tone={ROLE_TONE[connection.role]}>{ROLE_LABEL[connection.role]}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="secondary" size="sm" onClick={refreshSchema}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Refresh schema</span>
          </Button>
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 overflow-hidden rounded-full border hairline hover:border-line-strong"
                  aria-label="Account menu"
                >
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.user.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="block h-full w-full bg-bg-raised text-center font-mono text-xs leading-8">
                      {(session.user.name ?? session.user.email ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </button>
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
      </header>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent side="right" className="max-w-[18rem] p-0" hideClose>
          <SidebarNav connectionId={connection.id} onNavigate={() => setMobileNavOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
