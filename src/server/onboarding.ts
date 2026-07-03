import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { sentryScans, userSettings } from "@/server/schema";
import type { ConnectionSummary } from "@/server/connections/repo";

/**
 * Getting-started state for the post-signup funnel. Derived from what the
 * account has actually done (not a stored step counter), so it stays
 * truthful if the user does things out of order or on another device.
 */
export interface OnboardingState {
  dismissed: boolean;
  /** id of the most recent connection, for deep links into the workspace. */
  firstConnectionId: string | null;
  steps: {
    addConnection: boolean;
    directPostgresUrl: boolean;
    sentryScan: boolean;
    aiConfigured: boolean;
  };
  /** True when every non-optional step is done (checklist auto-hides). */
  coreDone: boolean;
}

export async function getOnboardingState(
  userId: string,
  connections: ConnectionSummary[],
): Promise<OnboardingState> {
  const [settingsRow, scanRow] = await Promise.all([
    db
      .select({
        dismissedAt: userSettings.onboardingDismissedAt,
        aiKey: userSettings.encryptedOpenrouterKey,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1),
    db
      .select({ id: sentryScans.id })
      .from(sentryScans)
      .where(eq(sentryScans.userId, userId))
      .limit(1),
  ]);

  const steps = {
    addConnection: connections.length > 0,
    directPostgresUrl: connections.some((c) => c.hasPostgresUrl),
    sentryScan: scanRow.length > 0,
    aiConfigured: settingsRow[0]?.aiKey != null,
  };

  return {
    dismissed: settingsRow[0]?.dismissedAt != null,
    firstConnectionId: connections[0]?.id ?? null,
    steps,
    coreDone: steps.addConnection && steps.directPostgresUrl && steps.sentryScan,
  };
}
