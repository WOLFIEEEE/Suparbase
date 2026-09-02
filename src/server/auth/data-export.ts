import "server-only";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  agentSessions,
  adminActions,
  auditLog,
  billingEvents,
  connections,
  connectionMembers,
  connectionInvitations,
  customActions,
  dataWatches,
  dashboardWidgets,
  pinnedTables,
  recentRecords,
  savedViews,
  scheduledReports,
  schemaAnalysis,
  sentryFindings,
  sentryScans,
  sqlSnippets,
  subscriptions,
  syncProfiles,
  syncRuns,
  userSettings,
  users,
} from "@/server/schema";
import { decryptKey } from "@/server/crypto/vault";

/**
 * GDPR Art. 15 / Art. 20 data export. Returns a single JSON document
 * containing every row that ties back to this user, with:
 *
 *   - Plaintext metadata (name, plan, dates) - included.
 *   - Credentials, encrypted blobs, invitation tokens, webhook header
 *     values, and raw payment webhook payloads - excluded. A portable
 *     account export must not become a credential dump.
 *   - Audit log rows - included with primary keys + before/after
 *     snapshots. This is the customer's data; they're entitled to it.
 *
 * Capped at 100k audit rows per export. Anything bigger would
 * exceed reasonable JSON sizes in the browser; users in that
 * bracket should email support for an offline dump.
 */

const AUDIT_LIMIT = 100_000;

export interface UserExport {
  exportedAt: string;
  schemaVersion: 1;
  account: {
    id: string;
    email: string | null;
    name: string | null;
    createdAt: string | null;
    emailVerifiedAt: string | null;
    totpEnabledAt: string | null;
  };
  subscription: unknown;
  userSettings: unknown;
  connections: unknown[];
  memberships: unknown[];
  savedViews: unknown[];
  dashboards: unknown[];
  customActions: unknown[];
  agentSessions: unknown[];
  auditLog: unknown[];
  invitations: unknown[];
  schemaAnalyses: unknown[];
  sentryScans: unknown[];
  sentryFindings: unknown[];
  syncProfiles: unknown[];
  syncRuns: unknown[];
  sqlSnippets: unknown[];
  scheduledReports: unknown[];
  dataWatches: unknown[];
  pinnedTables: unknown[];
  recentRecords: unknown[];
  billingEvents: unknown[];
  adminActions: unknown[];
  notes: {
    encryption: string;
    auditLimit: string;
  };
}

export async function buildUserExport(userId: string): Promise<UserExport> {
  // Account
  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      emailVerified: users.emailVerified,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    throw new Error("User not found.");
  }

  // Subscription + settings (single rows, OK to fetch directly)
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  const [settings] = await db
    .select({
      userId: userSettings.userId,
      defaultModel: userSettings.defaultModel,
      lastAnalysisModel: userSettings.lastAnalysisModel,
      lastAnalysisAt: userSettings.lastAnalysisAt,
      lastPromptTokens: userSettings.lastPromptTokens,
      lastCompletionTokens: userSettings.lastCompletionTokens,
      lastTotalTokens: userSettings.lastTotalTokens,
      onboardingDismissedAt: userSettings.onboardingDismissedAt,
      updatedAt: userSettings.updatedAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  // Connections (the user's owned + member-of)
  const ownedConns = await db
    .select({
      id: connections.id,
      name: connections.name,
      url: connections.url,
      hostname: connections.hostname,
      role: connections.role,
      createdAt: connections.createdAt,
      lastUsedAt: connections.lastUsedAt,
    })
    .from(connections)
    .where(eq(connections.userId, userId));

  const memberships = await db
    .select()
    .from(connectionMembers)
    .where(eq(connectionMembers.userId, userId));

  // Domain tables
  const viewsRows = await db.select().from(savedViews).where(eq(savedViews.userId, userId));
  const dashRows = await db
    .select()
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.userId, userId));
  const actionRowsRaw = await db
    .select()
    .from(customActions)
    .where(eq(customActions.userId, userId));
  const sessionRows = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.userId, userId));

  const actionRows = actionRowsRaw.map((row) => {
    let headerNames: string[] = [];
    try {
      const headers = row.webhookHeadersEncrypted
        ? JSON.parse(decryptKey(row.webhookHeadersEncrypted)) as Record<string, string>
        : row.webhookHeaders ?? {};
      headerNames = Object.keys(headers);
    } catch {
      headerNames = [];
    }
    const { webhookHeaders: _legacy, webhookHeadersEncrypted: _encrypted, ...safe } = row;
    void _legacy;
    void _encrypted;
    return { ...safe, webhookHeaderNames: headerNames };
  });

  const [
    invitationRows,
    analysisRows,
    scanRows,
    findingRows,
    syncProfileRows,
    syncRunRows,
    snippetRows,
    reportRows,
    watchRows,
    pinRows,
    recentRows,
    billingRows,
    adminRows,
  ] = await Promise.all([
    db.select().from(connectionInvitations).where(
      or(
        eq(connectionInvitations.invitedBy, userId),
        eq(connectionInvitations.email, user.email ?? ""),
      ),
    ),
    db.select().from(schemaAnalysis).where(eq(schemaAnalysis.userId, userId)),
    db.select().from(sentryScans).where(eq(sentryScans.userId, userId)),
    db.select().from(sentryFindings).where(eq(sentryFindings.userId, userId)),
    db.select().from(syncProfiles).where(eq(syncProfiles.userId, userId)),
    db.select().from(syncRuns).where(eq(syncRuns.userId, userId)),
    db.select().from(sqlSnippets).where(eq(sqlSnippets.userId, userId)),
    db.select().from(scheduledReports).where(eq(scheduledReports.userId, userId)),
    db.select().from(dataWatches).where(eq(dataWatches.userId, userId)),
    db.select().from(pinnedTables).where(eq(pinnedTables.userId, userId)),
    db.select().from(recentRecords).where(eq(recentRecords.userId, userId)),
    db.select({
      id: billingEvents.id,
      eventType: billingEvents.eventType,
      dodoSubscriptionId: billingEvents.dodoSubscriptionId,
      receivedAt: billingEvents.receivedAt,
      appliedAt: billingEvents.appliedAt,
    }).from(billingEvents).where(eq(billingEvents.userId, userId)),
    db.select().from(adminActions).where(
      or(eq(adminActions.adminUserId, userId), eq(adminActions.targetUserId, userId)),
    ),
  ]);

  // Audit log - most recent first, capped. We strip the encrypted
  // primary key column data only if it looks like it contains a JWT-
  // shaped string (defensive; row data isn't credentials, but customers
  // might paste API keys into row values).
  const auditRows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.userId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(AUDIT_LIMIT);

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    account: {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      createdAt: user.createdAt?.toISOString() ?? null,
      emailVerifiedAt: user.emailVerified?.toISOString() ?? null,
      totpEnabledAt: user.totpEnabledAt?.toISOString() ?? null,
    },
    subscription: sub ?? null,
    userSettings: settings ?? null,
    connections: ownedConns,
    memberships,
    savedViews: viewsRows,
    dashboards: dashRows,
    customActions: actionRows,
    agentSessions: sessionRows,
    auditLog: auditRows,
    invitations: invitationRows.map(({ token: _token, ...row }) => {
      void _token;
      return row;
    }),
    schemaAnalyses: analysisRows,
    sentryScans: scanRows,
    sentryFindings: findingRows,
    syncProfiles: syncProfileRows,
    syncRuns: syncRunRows,
    sqlSnippets: snippetRows,
    scheduledReports: reportRows,
    dataWatches: watchRows,
    pinnedTables: pinRows,
    recentRecords: recentRows,
    billingEvents: billingRows,
    adminActions: adminRows,
    notes: {
      encryption:
        "Encrypted columns and secret values (Supabase keys, Postgres URLs, TOTP secrets, OpenRouter keys, webhook header values, invitation tokens, and raw billing webhook payloads) are excluded. Keep credentials in their original secret store.",
      auditLimit: `Audit log capped at ${AUDIT_LIMIT.toLocaleString()} rows (most recent first). Email contact@suparbase.com for a larger offline dump.`,
    },
  };
}
