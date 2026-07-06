"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeft, ArrowLeftRight, Bell, Bot, CalendarClock, Database, FolderOpen, LayoutDashboard, Settings, ShieldAlert, ShieldCheck, Sparkles, SquareCode, Table2, UserCog, Zap } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { Wordmark } from "@/components/brand/Logo";
import { SITE } from "@/lib/seo/site";
import type { AiSettingsSummary } from "@/lib/types/analysis";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

interface NavItem {
  sub: string;
  label: string;
  icon: typeof LayoutDashboard;
  getCount?: (schemaTables: number, schemaColumns: number) => number | null;
}

interface NavSection {
  /** null heading = ungrouped top row (Dashboard sits above the labels). */
  heading: string | null;
  items: NavItem[];
}

// Grouped so the 15-item surface reads as five intents instead of one wall.
const sections: NavSection[] = [
  {
    heading: null,
    items: [{ sub: "", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    heading: "Data",
    items: [
      { sub: "tables", label: "Tables", icon: Table2, getCount: (t) => t },
      { sub: "schema", label: "Schema", icon: Database, getCount: (_, c) => c },
      { sub: "sql", label: "SQL", icon: SquareCode },
      { sub: "storage", label: "Storage", icon: FolderOpen },
      { sub: "auth-users", label: "Auth users", icon: UserCog },
    ],
  },
  {
    heading: "Automation",
    items: [
      { sub: "actions", label: "Actions", icon: Zap },
      { sub: "reports", label: "Reports", icon: CalendarClock },
      { sub: "watches", label: "Watches", icon: Bell },
      { sub: "sync", label: "Sync", icon: ArrowLeftRight },
    ],
  },
  {
    heading: "Safety",
    items: [
      { sub: "agents", label: "Agents", icon: Bot },
      { sub: "sentry", label: "Sentry", icon: ShieldAlert },
      { sub: "rls", label: "RLS", icon: ShieldCheck },
      { sub: "activity", label: "Activity", icon: Activity },
    ],
  },
  {
    heading: "Connection",
    items: [{ sub: "settings", label: "Settings", icon: Settings }],
  },
];

async function fetchAiSettings(): Promise<AiSettingsSummary> {
  const res = await fetch("/api/settings/ai");
  if (!res.ok) throw new AppError("server", "Failed to load AI settings.");
  return res.json();
}

interface SidebarProps {
  connectionId: string;
  onNavigate?: () => void;
  className?: string;
  showBrand?: boolean;
}

export function SidebarNav({ connectionId, onNavigate, className, showBrand = true }: SidebarProps) {
  const pathname = usePathname();
  const base = `/c/${connectionId}`;

  const { data: schema } = useSchema(connectionId);
  const { data: aiSettings } = useQuery({
    queryKey: ["settings", "ai"],
    queryFn: fetchAiSettings,
    staleTime: 60_000,
  });

  const tableCount = schema ? schema.tables.filter((t) => t.schema !== "auth" && t.schema !== "storage").length : null;
  const columnCount = schema
    ? schema.tables.reduce((n, t) => n + t.columns.length, 0)
    : null;

  return (
    <div className={cn("flex h-full w-60 flex-col border-r hairline bg-bg", className)}>
      {showBrand && (
        <div className="flex h-14 items-center border-b hairline px-5">
          <Link
            href="/connections"
            className="inline-flex items-center transition-colors hover:text-accent"
            onClick={onNavigate}
            aria-label="Suparbase home"
          >
            <Wordmark size="md" />
          </Link>
        </div>
      )}
      <Link
        href="/connections"
        onClick={onNavigate}
        className="mx-3 mt-3 inline-flex items-center gap-2 rounded px-2 py-1.5 text-[11px] text-fg-faint hover:bg-bg-raised hover:text-fg"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        All connections
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Workspace">
        {sections.map((section, si) => (
          <div key={section.heading ?? "root"} className={cn(si > 0 && "mt-4")}>
            {section.heading && (
              <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">
                {section.heading}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((it) => {
                const href = it.sub ? `${base}/${it.sub}` : base;
                const isActive = it.sub ? pathname?.startsWith(href) : pathname === base;
                const count = it.getCount ? it.getCount(tableCount ?? 0, columnCount ?? 0) : null;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-accent/10 text-fg before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-r before:bg-accent before:content-['']"
                        : "text-fg-muted hover:bg-bg-raised hover:text-fg",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {/* Accent glow that pools behind the active item. */}
                    {isActive && (
                      <span
                        className="pointer-events-none absolute inset-0 rounded-md bg-[radial-gradient(120px_40px_at_0%_50%,rgb(var(--accent)/0.14),transparent)]"
                        aria-hidden
                      />
                    )}
                    <it.icon
                      className={cn(
                        "relative h-4 w-4 shrink-0 transition-colors",
                        isActive ? "text-accent" : "text-fg-faint group-hover:text-fg-muted",
                      )}
                      aria-hidden
                    />
                    <span className="relative flex-1">{it.label}</span>
                    {count != null && (
                      <span
                        className={cn(
                          "relative rounded-full px-1.5 py-0 text-[10px] tabular-nums",
                          isActive ? "text-accent" : "text-fg-faint",
                        )}
                      >
                        {count.toLocaleString()}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t hairline p-3">
        <Link
          href="/settings/ai"
          onClick={onNavigate}
          className="flex items-start gap-3 rounded px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-bg-raised hover:text-fg"
        >
          <Sparkles className="mt-0.5 h-4 w-4 text-accent" aria-hidden />
          <div className="min-w-0 flex-1 leading-tight">
            <div>AI assistance</div>
            {aiSettings?.lastAnalysisModel && aiSettings.lastTotalTokens ? (
              <div className="mt-0.5 truncate text-[10px] text-fg-faint">
                {aiSettings.lastAnalysisModel} · {aiSettings.lastTotalTokens.toLocaleString()} tok
              </div>
            ) : (
              <div className="mt-0.5 text-[10px] text-fg-faint">not run yet</div>
            )}
          </div>
        </Link>
        <div className="px-3 text-[10px] uppercase tracking-wider text-fg-faint">
          v{SITE.version} · proxied · AI
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ connectionId }: { connectionId: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 self-start md:flex">
      <SidebarNav connectionId={connectionId} />
    </aside>
  );
}
