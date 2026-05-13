import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { getConnectionForUser, toSummary } from "@/server/connections/repo";
import { Sidebar } from "@/components/workspace/Sidebar";
import { Topbar } from "@/components/workspace/Topbar";
import { CommandPalette } from "@/components/workspace/CommandPalette";
import { CurrentConnectionProvider } from "@/lib/contexts/CurrentConnection";

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ConnectionLayout({ children, params }: Props) {
  const session = await auth();
  if (!session?.user) notFound();
  const { id } = await params;
  const row = await getConnectionForUser(session.user.id, id);
  if (!row) notFound();
  const connection = toSummary(row);

  return (
    <CurrentConnectionProvider connection={connection}>
      <div className="relative flex min-h-screen bg-bg text-fg">
        <Sidebar connectionId={connection.id} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar connection={connection} />
          <main className="flex-1">
            <div className="mx-auto w-full max-w-7xl px-6 py-8">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette />
    </CurrentConnectionProvider>
  );
}
