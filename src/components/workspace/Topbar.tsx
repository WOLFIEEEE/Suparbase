"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Menu, RefreshCw, LogOut, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchSchemaWithMeta } from "@/lib/api/hooks";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import { SidebarNav } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import type { ConnectionSummary, KeyRole } from "@/lib/types/connection";
import type { Schema } from "@/lib/types/schema";

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
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Refresh schema, properly:
   *   1. Ask PostgREST to drop its OpenAPI cache via NOTIFY pgrst,
   *      'reload schema' (server side, gated by direct PG URL).
   *   2. Re-fetch the OpenAPI doc with cache: no-store so the browser
   *      can't serve the stale response.
   *   3. Seed the React Query cache directly with the fresh schema
   *      and invalidate every other query keyed to this connection
   *      so dependent UI (table lists, dashboards, schema view)
   *      re-renders with the new data.
   *   4. Toast the result so the user sees the action landed.
   */
  const refreshSchema = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const { schema, postgrestReloaded } = await fetchSchemaWithMeta(
        connection.id,
        { force: true },
      );
      // Prime the cache with the fresh result + bump every dependent
      // query so subsequent reads pick up the new schema-derived state.
      qc.setQueryData<Schema>(["schema", connection.id], schema);
      await qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[1] === connection.id &&
          q.queryKey[0] !== "schema",
      });
      const tableCount = schema.tables.length;
      toast.success(
        postgrestReloaded
          ? `Schema reloaded · ${tableCount} table${tableCount === 1 ? "" : "s"}`
          : `Schema refreshed · ${tableCount} table${tableCount === 1 ? "" : "s"} (PostgREST cache may take ~10 min to clear; add a Direct Postgres URL on the connection to bypass)`,
      );
    } catch (e) {
      const msg = e instanceof AppError ? e.message : (e as Error).message ?? "Refresh failed.";
      toast.error(`Refresh failed: ${msg}`);
    } finally {
      setRefreshing(false);
    }
  }, [connection.id, qc, refreshing]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b hairline bg-bg/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-bg/70 sm:px-6">
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={refreshSchema}
                disabled={refreshing}
                aria-busy={refreshing}
                aria-label="Refresh schema"
              >
                {refreshing ? (
                  <Loader2 className={cn("h-3.5 w-3.5 animate-spin")} aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                )}
                <span className="hidden sm:inline">
                  {refreshing ? "Refreshing…" : "Refresh schema"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {connection.hasPostgresUrl
                ? "Re-introspect the project. Asks PostgREST to drop its OpenAPI cache first."
                : "Re-introspect the project. Add a Direct Postgres URL on connection settings to also drop PostgREST's cache."}
            </TooltipContent>
          </Tooltip>
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
                  <div className="truncate font-medium text-fg">
                    {session.user.name ?? session.user.email}
                  </div>
                  {session.user.name && (
                    <div className="truncate text-fg-faint">{session.user.email}</div>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/connections">All connections</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/billing">Billing &amp; plan</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/ai">AI assistance</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    void import("@/lib/analytics").then((m) => m.resetAnalytics());
                    signOut({ callbackUrl: "/" });
                  }}
                >
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
