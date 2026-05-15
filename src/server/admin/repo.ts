import "server-only";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  adminActions,
  connections,
  subscriptions,
  users,
  type AdminActionRow,
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
}

/**
 * Searchable list of all users with a flattened plan view. Limited to
 * 200 rows per page — the admin panel surfaces a search box for the
 * common "find one user by email" workflow.
 */
export async function listUsers(params: {
  search?: string;
  limit?: number;
}): Promise<AdminUserRow[]> {
  const limit = Math.min(params.limit ?? 200, 500);
  const search = params.search?.trim();

  const baseQuery = db
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
      connectionCount: sql<number>`(
        SELECT count(*)::int FROM ${connections} WHERE ${connections.userId} = ${users.id}
      )`,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .orderBy(desc(users.createdAt))
    .limit(limit);

  const rows = search
    ? await baseQuery.where(
        or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`)),
      )
    : await baseQuery;

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
  }));
}

export interface AdminUserDetail extends AdminUserRow {
  adminNote: string | null;
  dodoCustomerId: string | null;
  dodoSubscriptionId: string | null;
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
      connectionCount: sql<number>`(
        SELECT count(*)::int FROM ${connections} WHERE ${connections.userId} = ${users.id}
      )`,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
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
  };
}

export type AdminActionName =
  | "grant_plan"
  | "revoke_plan"
  | "reset_subscription"
  | "extend_trial";

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

export async function listRecentAdminActions(limit = 100): Promise<AdminActionRow[]> {
  return await db
    .select()
    .from(adminActions)
    .orderBy(desc(adminActions.createdAt))
    .limit(limit);
}

/** Total users + signups this week, for the admin dashboard. */
export async function getUserStats(): Promise<{ totalUsers: number; newThisWeek: number }> {
  const [totalRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(users);
  const [newRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.createdAt} > now() - interval '7 days'`);
  return {
    totalUsers: totalRow?.c ?? 0,
    newThisWeek: newRow?.c ?? 0,
  };
}
