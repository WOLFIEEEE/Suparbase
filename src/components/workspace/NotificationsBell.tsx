"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Check, GitCompareArrows, Mail, RefreshCw, ShieldAlert, Users, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { relativeFromNow } from "@/lib/ui/time";
import { cn } from "@/lib/ui/cn";

type Kind =
  | "sentry_critical"
  | "sentry_scan"
  | "watch_alert"
  | "report_failed"
  | "sync_failed"
  | "invitation"
  | "schema_changed"
  | "system";

interface Notification {
  id: string;
  kind: Kind;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

interface Inbox {
  notifications: Notification[];
  unread: number;
}

const KIND_ICON: Record<Kind, typeof Bell> = {
  sentry_critical: ShieldAlert,
  sentry_scan: ShieldAlert,
  watch_alert: Eye,
  report_failed: Mail,
  sync_failed: RefreshCw,
  invitation: Users,
  schema_changed: GitCompareArrows,
  system: Bell,
};

const KIND_TONE: Partial<Record<Kind, string>> = {
  sentry_critical: "text-danger",
  sync_failed: "text-danger",
  report_failed: "text-warn",
  watch_alert: "text-warn",
};

async function fetchInbox(): Promise<Inbox> {
  const res = await fetch("/api/notifications?limit=30");
  if (!res.ok) throw new Error("Could not load notifications.");
  return (await res.json()) as Inbox;
}

/**
 * In-app inbox. Polls the unread count every minute; opening the popover
 * shows the newest 30 and lets the user clear them. Lives in both the
 * account header and the workspace top bar.
 */
export function NotificationsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchInbox,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.unread ?? 0;
  const items = data?.notifications ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          {unread > 0 ? <BellRing className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 min-w-[1rem] rounded-full bg-accent px-1 text-center text-[9px] font-semibold leading-4 text-accent-fg">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b hairline px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate([])}
              className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg"
            >
              <Check className="h-3 w-3" aria-hidden /> Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-fg-muted">
            Nothing yet. Sentry criticals, watch alerts, failed reports and syncs, invitations, and schema changes land here.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? Bell;
              const inner = (
                <>
                  <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", KIND_TONE[n.kind] ?? "text-fg-faint")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-xs", n.readAt ? "text-fg-muted" : "font-medium text-fg")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-fg-faint">{n.body}</span>}
                    <span className="mt-0.5 block text-[10px] text-fg-faint">{relativeFromNow(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
                </>
              );
              const className = "flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-bg-sunken";
              return (
                <li key={n.id} className="border-b hairline last:border-b-0">
                  {n.href ? (
                    <Link
                      href={n.href}
                      className={className}
                      onClick={() => {
                        if (!n.readAt) markRead.mutate([n.id]);
                        setOpen(false);
                      }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" className={className} onClick={() => !n.readAt && markRead.mutate([n.id])}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
