import { AppHeader } from "@/components/workspace/AppHeader";
import { AppFooter } from "@/components/workspace/AppFooter";

/**
 * Shell for top-level account pages (connections, settings). The workspace
 * routes under /c/[id]/* have their own chrome and live in a sibling tree;
 * this layout is intentionally isolated to that scope.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">{children}</div>
      </main>
      <AppFooter width="narrow" />
    </div>
  );
}
