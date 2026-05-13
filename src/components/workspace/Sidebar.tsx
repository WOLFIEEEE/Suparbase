import { NavLink } from "react-router-dom";
import { Database, LayoutDashboard, Settings, Table2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tables", label: "Tables", icon: Table2 },
  { to: "/schema", label: "Schema", icon: Database },
  { to: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
  showBrand?: boolean;
}

export function SidebarNav({ onNavigate, className, showBrand = true }: SidebarProps) {
  return (
    <div className={cn("flex h-full w-60 flex-col border-r hairline bg-bg", className)}>
      {showBrand && (
        <div className="flex h-14 items-center gap-2 border-b hairline px-5">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
          <span className="font-display text-lg tracking-tight">suparbase</span>
        </div>
      )}
      <nav className="flex-1 space-y-1 p-3" aria-label="Workspace">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-bg-raised text-fg"
                  : "text-fg-muted hover:bg-bg-raised hover:text-fg",
              )
            }
          >
            <it.icon className="h-4 w-4" aria-hidden />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t hairline p-3 text-[10px] uppercase tracking-wider text-fg-faint">
        v0.1 · client-only
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden shrink-0 md:flex">
      <SidebarNav />
    </aside>
  );
}
