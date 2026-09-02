import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAdminSession } from "@/server/admin/guard";
import { AppHeader } from "@/components/workspace/AppHeader";
import { AppFooter } from "@/components/workspace/AppFooter";
import { AdminNav } from "@/components/admin/AdminNav";

/**
 * /admin shell. Renders only for MFA-enrolled emails in SUPARBASE_ADMIN_EMAILS;
 * everything else 404s - we don't acknowledge that an admin surface
 * exists.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <AppHeader />
      <main id="main" className="flex-1">
        <div className="mx-auto grid w-full max-w-[100rem] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-8">
          <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <div className="mb-3 flex min-h-10 items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span className="min-w-0 truncate text-accent" title={admin.email}>
                Operator · {admin.email}
              </span>
            </div>
            <AdminNav />
            <p className="mt-4 hidden border-t hairline px-3 pt-4 text-[11px] leading-5 text-fg-faint lg:block">
              Customer data is visible here for support and incident response. Use the minimum access needed.
            </p>
          </aside>
          <div className="min-w-0 pb-4">{children}</div>
        </div>
      </main>
      <AppFooter width="bare" />
    </div>
  );
}
