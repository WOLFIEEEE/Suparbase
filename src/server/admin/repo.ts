import "server-only";
import { and, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import {
  accounts,
  adminActions,
  agentSessions,
  auditLog,
  billingEvents,
  connections,
  connectionMembers,
  dataWatches,
  scheduledReports,
  sentryFindings,
  subscriptions,
  syncRuns,
  users,
  type AdminActionRow,
  type Plan,
  type SubscriptionStatus,
} from "@/server/schema";

/**
 * Admin-panel queries. Kept off the public repo files so a casual
 * reader can tell at a glance which queries are "operator-level".
 */

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date | null;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  connectionCount: number;
  grantedByAdmin: string | null;
  totpEnabledAt: Date | null;
  deletionScheduledAt: Date | null;
  emailUndeliverableAt: Date | null;
  emailUndeliverableReason: string | null;
}

export type AdminUserVerificationFilter = "verified" | "unverified" | "suppressed" | "deletion";

export interface AdminUserListParams {
  search?: string;
  plan?: Plan;
  status?: SubscriptionStatus;
  verification?: AdminUserVerificationFilter;
  limit?: number;
  offset?: number;
}

function userConditions(params: AdminUserListParams): SQL | undefined {
  const conditions: SQL[] = [];
  const search = params.search?.trim();
  if (search) {
    conditions.push(or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))!);
  }
  if (params.plan === "free") {
    conditions.push(or(isNull(subscriptions.plan), eq(subscriptions.plan, "free"))!);
  } else if (params.plan) {
    conditions.push(eq(subscriptions.plan, params.plan));
  }
  if (params.status === "none") {
    conditions.push(or(isNull(subscriptions.status), eq(subscriptions.status, "none"))!);
  } else if (params.status) {
    conditions.push(eq(subscriptions.status, params.status));
  }
  if (params.verification === "verified") conditions.push(sql`${users.emailVerified} IS NOT NULL`);
  if (params.verification === "unverified") conditions.push(isNull(users.emailVerified));
  if (params.verification === "suppressed") conditions.push(sql`${users.emailUndeliverableAt} IS NOT NULL`);
  if (params.verification === "deletion") conditions.push(sql`${users.deletionScheduledAt} IS NOT NULL`);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Searchable list of all users with a flattened plan view. Limited to
 * 200 rows per page - the admin panel surfaces a search box for the
 * common "find one user by email" workflow.
 */
export async function listUsers(params: AdminUserListParams): Promise<AdminUserRow[]> {
  const limit = Math.min(params.limit ?? 200, 500);
  const offset = Math.max(params.offset ?? 0, 0);

  // Pre-aggregate connection counts in a CTE rather than running a
  // correlated subquery per user row (which is N×lookup against
  // `connections`). This becomes one indexed GROUP BY scan plus a
  // single left-join hash probe.
  const connCounts = db.$with("conn_counts").as(
    db
      .select({
        userId: connections.userId,
        c: sql<number>`count(*)::int`.as("c"),
      })
      .from(connections)
      .groupBy(connections.userId),
  );

  const whereClause = userConditions(params);

  const baseQuery = db
    .with(connCounts)
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerifiedAt: users.emailVerified,
      createdAt: users.createdAt,
      plan: subscriptions.plan,
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      grantedByAdmin: subscriptions.grantedByAdmin,
      totpEnabledAt: users.totpEnabledAt,
      deletionScheduledAt: users.deletionScheduledAt,
      emailUndeliverableAt: users.emailUndeliverableAt,
      emailUndeliverableReason: users.emailUndeliverableReason,
      connectionCount: sql<number>`coalesce(${connCounts.c}, 0)`,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .leftJoin(connCounts, eq(connCounts.userId, users.id))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const rows = whereClause ? await baseQuery.where(whereClause) : await baseQuery;

  return rows.map((r) => ({
    id: r.id,
    email: r.email ?? "",
    name: r.name,
    emailVerifiedAt: r.emailVerifiedAt,
    createdAt: r.createdAt,
    plan: r.plan ?? "free",
    status: r.status ?? "none",
    trialEndsAt: r.trialEndsAt,
    currentPeriodEnd: r.currentPeriodEnd,
    connectionCount: r.connectionCount,
    grantedByAdmin: r.grantedByAdmin,
    totpEnabledAt: r.totpEnabledAt,
    deletionScheduledAt: r.deletionScheduledAt,
    emailUndeliverableAt: r.emailUndeliverableAt,
    emailUndeliverableReason: r.emailUndeliverableReason,
  }));
}

export async function countUsers(params: AdminUserListParams = {}): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(userConditions(params));
  return row?.count ?? 0;
}

export interface AdminConnectionRow {
  id: string;
  name: string;
  hostname: string;
  role: string;
  ownerId: string;
  ownerEmail: string | null;
  memberCount: number;
  hasPostgresUrl: boolean;
  hasAlertWebhook: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface AdminConnectionListParams {
  search?: string;
  role?: "anon" | "authenticated" | "service_role" | "unknown";
  capability?: "postgres" | "webhook";
  activity?: "7d" | "30d" | "stale";
  limit?: number;
  offset?: number;
}

function connectionConditions(params: AdminConnectionListParams): SQL | undefined {
  const values: SQL[] = [];
  const search = params.search?.trim();
  if (search) {
    values.push(
      or(
        ilike(connections.name, `%${search}%`),
        ilike(connections.hostname, `%${search}%`),
        ilike(users.email, `%${search}%`),
      )!,
    );
  }
  if (params.role) values.push(eq(connections.role, params.role));
  if (params.capability === "postgres") values.push(sql`${connections.encryptedPostgresUrl} IS NOT NULL`);
  if (params.capability === "webhook") values.push(sql`${connections.alertWebhookUrl} IS NOT NULL`);
  if (params.activity === "7d") values.push(gte(connections.lastUsedAt, sql`now() - interval '7 days'`));
  if (params.activity === "30d") values.push(gte(connections.lastUsedAt, sql`now() - interval '30 days'`));
  if (params.activity === "stale") values.push(lt(connections.lastUsedAt, sql`now() - interval '30 days'`));
  return values.length > 0 ? and(...values) : undefined;
}

export async function listAdminConnections(params: AdminConnectionListParams = {}): Promise<AdminConnectionRow[]> {
  return await db
    .select({
      id: connections.id,
      name: connections.name,
      hostname: connections.hostname,
      role: connections.role,
      ownerId: connections.userId,
      ownerEmail: users.email,
      memberCount: sql<number>`(select count(*)::int from ${connectionMembers} where ${connectionMembers.connectionId} = ${connections.id})`,
      hasPostgresUrl: sql<boolean>`${connections.encryptedPostgresUrl} IS NOT NULL`,
      hasAlertWebhook: sql<boolean>`${connections.alertWebhookUrl} IS NOT NULL`,
      createdAt: connections.createdAt,
      lastUsedAt: connections.lastUsedAt,
    })
    .from(connections)
    .leftJoin(users, eq(users.id, connections.userId))
    .where(connectionConditions(params))
    .orderBy(desc(connections.lastUsedAt))
    .limit(Math.min(params.limit ?? 100, 500))
    .offset(Math.max(params.offset ?? 0, 0));
}

export async function countAdminConnections(params: AdminConnectionListParams = {}): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connections)
    .leftJoin(users, eq(users.id, connections.userId))
    .where(connectionConditions(params));
  return row?.count ?? 0;
}

export interface AdminUserDetail extends AdminUserRow {
  adminNote: string | null;
  dodoCustomerId: string | null;
  dodoSubscriptionId: string | null;
  hasPassword: boolean;
  authProviders: string[];
  sharedConnectionCount: number;
  auditWrites30d: number;
  lastAuditAt: Date | null;
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerifiedAt: users.emailVerified,
      createdAt: users.createdAt,
      plan: subscriptions.plan,
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      grantedByAdmin: subscriptions.grantedByAdmin,
      adminNote: subscriptions.adminNote,
      dodoCustomerId: subscriptions.dodoCustomerId,
      dodoSubscriptionId: subscriptions.dodoSubscriptionId,
      totpEnabledAt: users.totpEnabledAt,
      deletionScheduledAt: users.deletionScheduledAt,
      emailUndeliverableAt: users.emailUndeliverableAt,
      emailUndeliverableReason: users.emailUndeliverableReason,
      hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
      connectionCount: sql<number>`(
        SELECT count(*)::int FROM ${connections} WHERE ${connections.userId} = ${users.id}
      )`,
      sharedConnectionCount: sql<number>`(
        SELECT count(*)::int FROM ${connectionMembers} WHERE ${connectionMembers.userId} = ${users.id}
      )`,
      auditWrites30d: sql<number>`(
        SELECT count(*)::int FROM ${auditLog}
        WHERE ${auditLog.userId} = ${users.id}
          AND ${auditLog.createdAt} > now() - interval '30 days'
      )`,
      lastAuditAt: sql<Date | null>`(
        SELECT max(${auditLog.createdAt}) FROM ${auditLog} WHERE ${auditLog.userId} = ${users.id}
      )`,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const providerRows = await db
    .selectDistinct({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return {
    id: r.id,
    email: r.email ?? "",
    name: r.name,
    emailVerifiedAt: r.emailVerifiedAt,
    createdAt: r.createdAt,
    plan: r.plan ?? "free",
    status: r.status ?? "none",
    trialEndsAt: r.trialEndsAt,
    currentPeriodEnd: r.currentPeriodEnd,
    connectionCount: r.connectionCount,
    grantedByAdmin: r.grantedByAdmin,
    adminNote: r.adminNote,
    dodoCustomerId: r.dodoCustomerId,
    dodoSubscriptionId: r.dodoSubscriptionId,
    totpEnabledAt: r.totpEnabledAt,
    deletionScheduledAt: r.deletionScheduledAt,
    emailUndeliverableAt: r.emailUndeliverableAt,
    emailUndeliverableReason: r.emailUndeliverableReason,
    hasPassword: r.hasPassword,
    authProviders: providerRows.map((row) => row.provider),
    sharedConnectionCount: r.sharedConnectionCount,
    auditWrites30d: r.auditWrites30d,
    lastAuditAt: r.lastAuditAt,
  };
}

export type AdminActionName =
  | "grant_plan"
  | "revoke_plan"
  | "reset_subscription"
  | "extend_trial"
  | "clear_email_suppression"
  | "revoke_sessions";

/**
 * Append-only audit row for operator actions. Always called BEFORE
 * the mutation so a half-applied admin action still leaves a trace.
 */
export async function recordAdminAction(input: {
  adminUserId: string;
  action: AdminActionName;
  targetUserId?: string;
  details: Record<string, unknown>;
}): Promise<AdminActionRow> {
  const rows = await db
    .insert(adminActions)
    .values({
      adminUserId: input.adminUserId,
      action: input.action,
      targetUserId: input.targetUserId ?? null,
      details: input.details,
    })
    .returning();
  return rows[0]!;
}

export interface AdminActionListRow extends AdminActionRow {
  adminEmail: string | null;
  targetEmail: string | null;
}

export async function listAdminActions(params: {
  limit?: number;
  offset?: number;
  action?: AdminActionName;
} = {}): Promise<AdminActionListRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);
  const offset = Math.max(params.offset ?? 0, 0);
  const rows = await db
    .select({
      id: adminActions.id,
      adminUserId: adminActions.adminUserId,
      action: adminActions.action,
      targetUserId: adminActions.targetUserId,
      details: adminActions.details,
      createdAt: adminActions.createdAt,
      adminEmail: sql<string | null>`(select email from users where id = ${adminActions.adminUserId})`,
      targetEmail: sql<string | null>`(select email from users where id = ${adminActions.targetUserId})`,
    })
    .from(adminActions)
    .where(params.action ? eq(adminActions.action, params.action) : undefined)
    .orderBy(desc(adminActions.createdAt))
    .limit(limit)
    .offset(offset);
  return rows as AdminActionListRow[];
}

export async function countAdminActions(action?: AdminActionName): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminActions)
    .where(action ? eq(adminActions.action, action) : undefined);
  return row?.count ?? 0;
}

export async function clearUserEmailSuppression(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ emailUndeliverableAt: null, emailUndeliverableReason: null })
    .where(eq(users.id, userId));
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await db.update(users).set({ passwordChangedAt: new Date() }).where(eq(users.id, userId));
}

export interface AdminOperationsSnapshot {
  users: {
    total: number;
    new7d: number;
    verified: number;
    mfaEnabled: number;
    emailSuppressed: number;
    deletionScheduled: number;
  };
  connections: {
    total: number;
    active7d: number;
    serviceRole: number;
    directPostgres: number;
  };
  workload: {
    auditWrites24h: number;
    activeAgentSessions: number;
    criticalFindings: number;
    failedSyncRuns24h: number;
  };
  automation: {
    enabledWatches: number;
    watchErrors: number;
    enabledReports: number;
    reportErrors: number;
  };
  billing: {
    events24h: number;
    unappliedEvents: number;
  };
}

export async function getAdminOperationsSnapshot(): Promise<AdminOperationsSnapshot> {
  const count = async (table: AnyPgTable, condition?: SQL) => {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(condition);
    return row?.count ?? 0;
  };

  const [
    totalUsers,
    new7d,
    verified,
    mfaEnabled,
    emailSuppressed,
    deletionScheduled,
    totalConnections,
    active7d,
    serviceRole,
    directPostgres,
    auditWrites24h,
    activeAgentSessions,
    criticalFindings,
    failedSyncRuns24h,
    enabledWatches,
    watchErrors,
    enabledReports,
    reportErrors,
    events24h,
    unappliedEvents,
  ] = await Promise.all([
    count(users),
    count(users, gte(users.createdAt, sql`now() - interval '7 days'`)),
    count(users, sql`${users.emailVerified} IS NOT NULL`),
    count(users, sql`${users.totpEnabledAt} IS NOT NULL`),
    count(users, sql`${users.emailUndeliverableAt} IS NOT NULL`),
    count(users, sql`${users.deletionScheduledAt} IS NOT NULL`),
    count(connections),
    count(connections, gte(connections.lastUsedAt, sql`now() - interval '7 days'`)),
    count(connections, eq(connections.role, "service_role")),
    count(connections, sql`${connections.encryptedPostgresUrl} IS NOT NULL`),
    count(auditLog, gte(auditLog.createdAt, sql`now() - interval '24 hours'`)),
    count(agentSessions, and(eq(agentSessions.status, "active"), gte(agentSessions.lastSeenAt, sql`now() - interval '15 minutes'`))),
    count(sentryFindings, and(eq(sentryFindings.status, "open"), eq(sentryFindings.severity, "critical"))),
    count(syncRuns, and(eq(syncRuns.status, "failed"), gte(syncRuns.startedAt, sql`now() - interval '24 hours'`))),
    count(dataWatches, eq(dataWatches.enabled, true)),
    count(dataWatches, sql`${dataWatches.enabled} = true AND ${dataWatches.lastError} IS NOT NULL`),
    count(scheduledReports, eq(scheduledReports.enabled, true)),
    count(scheduledReports, sql`${scheduledReports.enabled} = true AND ${scheduledReports.lastError} IS NOT NULL`),
    count(billingEvents, gte(billingEvents.receivedAt, sql`now() - interval '24 hours'`)),
    count(billingEvents, isNull(billingEvents.appliedAt)),
  ]);

  return {
    users: { total: totalUsers, new7d, verified, mfaEnabled, emailSuppressed, deletionScheduled },
    connections: { total: totalConnections, active7d, serviceRole, directPostgres },
    workload: { auditWrites24h, activeAgentSessions, criticalFindings, failedSyncRuns24h },
    automation: { enabledWatches, watchErrors, enabledReports, reportErrors },
    billing: { events24h, unappliedEvents },
  };
}
