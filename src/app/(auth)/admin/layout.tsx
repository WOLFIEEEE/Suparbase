import { notFound } from "next/navigation";
import Link from "next/link";
import { Activity, LayoutDashboard, ShieldCheck, Users } from "lucide-react";
import { getAdminSession } from "@/server/admin/guard";
import { AppHeader } from "@/components/workspace/AppHeader";
import { AppFooter } from "@/components/workspace/AppFooter";

/**
 * /admin shell. Renders only for emails in SUPARBASE_ADMIN_EMAILS;
 * everything else 404s — we don't acknowledge that an admin surface
 * exists.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[14rem_1fr]">
          <aside className="md:sticky md:top-20 md:self-start">
            <div className="mb-4 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span className="text-accent">Admin · {admin.email}</span>
            </div>
            <nav aria-label="Admin sections">
              <ul className="space-y-1">
                <NavItem href="/admin" icon={LayoutDashboard} label="Dashboard" />
                <NavItem href="/admin/users" icon={Users} label="Users" />
                <NavItem href="/admin/billing" icon={Activity} label="Webhook events" />
              </ul>
            </nav>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <AppFooter width="bare" />
    </div>
  );
}

function NavItem({ href, icon: Icon, label }: { href: string; icon: typeof Users; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-bg-raised hover:text-fg"
      >
        <Icon className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
        {label}
      </Link>
    </li>
  );
}
