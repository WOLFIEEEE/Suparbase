"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FileClock,
  FileSearch,
  Gauge,
  Database,
  LayoutDashboard,
  Mail,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/ui/cn";

const items: ReadonlyArray<{ href: string; label: string; icon: LucideIcon; exact?: boolean }> = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: Database },
  { href: "/admin/audit", label: "Data audit", icon: FileSearch },
  { href: "/admin/actions", label: "Admin actions", icon: FileClock },
  { href: "/admin/billing", label: "Billing events", icon: Activity },
  { href: "/admin/operations", label: "Operations", icon: Gauge },
  { href: "/admin/email", label: "Email", icon: Mail },
] as const;

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections">
      <ul className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  active
                    ? "bg-accent/10 font-medium text-fg"
                    : "text-fg-muted hover:bg-bg-raised hover:text-fg",
                )}
              >
                <Icon
                  className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-fg-faint")}
                  aria-hidden
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
