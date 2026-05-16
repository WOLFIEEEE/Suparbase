"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { identifyUser } from "@/lib/analytics";

/**
 * Mounts inside Providers. When NEXT_PUBLIC_POSTHOG_KEY is set + the
 * session loads, the SDK is fetched + identify() fires once with the
 * user id + email. No-op when analytics is disabled.
 *
 * Why a component and not a layout call: the layout is a server
 * component; we need access to useSession() which is client-only.
 * This zero-DOM component is the cleanest bridge.
 */
export function AnalyticsBoot() {
  const { data: session, status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") return;
    const id = session?.user?.id;
    if (!id) return;
    identifyUser({
      id,
      email: session.user?.email ?? null,
      name: session.user?.name ?? null,
    });
  }, [status, session?.user?.id, session?.user?.email, session?.user?.name]);
  return null;
}
