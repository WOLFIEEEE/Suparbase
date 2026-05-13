"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Database, LayoutDashboard, Settings, Table2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";

const items = [
  { sub: "", label: "Dashboard", icon: LayoutDashboard },
  { sub: "tables", label: "Tables", icon: Table2 },
  { sub: "schema", label: "Schema", icon: Database },
  { sub: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  connectionId: string;
  onNavigate?: () => void;
  className?: string;
  showBrand?: boolean;
}

export function SidebarNav({ connectionId, onNavigate, className, showBrand = true }: SidebarProps) {
  const pathname = usePathname();
  const base = `/c/${connectionId}`;

  return (
    <div className={cn("flex h-full w-60 flex-col border-r hairline bg-bg", className)}>
      {showBrand && (
        <div className="flex h-14 items-center gap-2 border-b hairline px-5">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
          <Link href="/connections" className="font-display text-lg tracking-tight hover:text-accent" onClick={onNavigate}>
            suparbase
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
      <nav className="flex-1 space-y-1 p-3" aria-label="Workspace">
        {items.map((it) => {
          const href = it.sub ? `${base}/${it.sub}` : base;
          const isActive = it.sub ? pathname?.startsWith(href) : pathname === base;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                isActive ? "bg-bg-raised text-fg" : "text-fg-muted hover:bg-bg-raised hover:text-fg",
              )}
            >
              <it.icon className="h-4 w-4" aria-hidden />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t hairline p-3 text-[10px] uppercase tracking-wider text-fg-faint">
        v0.2 · proxied
      </div>
    </div>
  );
}

export function Sidebar({ connectionId }: { connectionId: string }) {
  return (
    <aside className="hidden shrink-0 md:flex">
      <SidebarNav connectionId={connectionId} />
    </aside>
  );
}
