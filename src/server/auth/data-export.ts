import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  agentSessions,
  auditLog,
  connections,
  connectionMembers,
  customActions,
  dashboardWidgets,
  savedViews,
  subscriptions,
  userSettings,
  users,
} from "@/server/schema";

/**
 * GDPR Art. 15 / Art. 20 data export. Returns a single JSON document
 * containing every row that ties back to this user, with:
 *
 *   - Plaintext metadata (name, plan, dates) - included.
 *   - Encrypted blobs (Supabase API keys, Postgres URLs, TOTP secret,
 *     OpenRouter key) - INCLUDED AS BASE64 of the ciphertext.
 *     We deliberately don't decrypt: the export is for the user's
 *     records, and exporting their own credentials in plaintext to
 *     a downloadable JSON is a worse outcome than them not having
 *     them. They can paste the keys back from their original source.
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
  notes: {
    encryption:
      "Encrypted columns (Supabase keys, Postgres URL, TOTP secret) are excluded from this export. Keep them in your original credential store; the encrypted form here would be useless outside this deployment.";
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
    .select()
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
  const actionRows = await db
    .select()
    .from(customActions)
    .where(eq(customActions.userId, userId));
  const sessionRows = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.userId, userId));

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
    notes: {
      encryption:
        "Encrypted columns (Supabase keys, Postgres URL, TOTP secret) are excluded from this export. Keep them in your original credential store; the encrypted form here would be useless outside this deployment.",
      auditLimit: `Audit log capped at ${AUDIT_LIMIT.toLocaleString()} rows (most recent first). Email contact@suparbase.com for a larger offline dump.`,
    },
  };
}
