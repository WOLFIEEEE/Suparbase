import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionAccess, toSummary } from "@/server/connections/repo";
import { Sidebar } from "@/components/workspace/Sidebar";
import { Topbar } from "@/components/workspace/Topbar";
import { AppFooter } from "@/components/workspace/AppFooter";
import { WorkspaceOverlays } from "@/components/workspace/WorkspaceOverlays";
import { CurrentConnectionProvider } from "@/lib/contexts/CurrentConnection";

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ConnectionLayout({ children, params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const access = await getConnectionAccess(session.user.id, id);
  if (!access) notFound();
  const connection = toSummary(access.conn, access.role);

  return (
    <CurrentConnectionProvider connection={connection}>
      <div className="relative flex min-h-screen bg-bg text-fg">
        <Sidebar connectionId={connection.id} />
        <div className="flex min-w-0 flex-1 flex-col bg-bg-sunken">
          <Topbar connection={connection} />
          <main id="main" className="grid-texture flex-1">
            <div className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
          <AppFooter width="wide" />
        </div>
      </div>
      <WorkspaceOverlays />
    </CurrentConnectionProvider>
  );
}
