import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { getActivePlan } from "@/server/billing/repo";
import { PastDueBanner } from "@/components/billing/PastDueBanner";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  // Resolve the user's billing state once per request so we can hoist
  // a dunning banner above every signed-in surface. Soft-fails on
  // transient DB errors so a billing-table outage doesn't lock anyone
  // out of the app itself.
  let pastDuePlan: string | null = null;
  try {
    if (session.user.id) {
      const active = await getActivePlan(session.user.id);
      if (active.isPastDue) {
        pastDuePlan = active.limits.label;
      }
    }
  } catch {
    // Soft-fail: render without banner.
  }

  return (
    <>
      {pastDuePlan && <PastDueBanner planLabel={pastDuePlan} />}
      {children}
    </>
  );
}
