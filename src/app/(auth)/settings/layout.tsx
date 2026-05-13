import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export default async function GlobalSettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
        <Link href="/connections" className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-fg">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> connections
        </Link>
        {children}
      </div>
    </div>
  );
}
