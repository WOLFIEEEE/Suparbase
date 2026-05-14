import { auth } from "@/server/auth";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

interface Props {
  children: React.ReactNode;
}

export async function PublicLayout({ children }: Props) {
  const session = await auth();
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PublicNav isSignedIn={!!session?.user} />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
