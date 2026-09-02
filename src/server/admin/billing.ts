import "server-only";
import { and, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { billingEvents, users, type BillingEventRow } from "@/server/schema";

export interface AdminBillingEventRow extends BillingEventRow {
  userEmail: string | null;
}

export interface AdminBillingEventParams {
  query?: string;
  eventType?: string;
  applied?: "applied" | "pending";
  limit?: number;
  offset?: number;
}

function conditions(params: AdminBillingEventParams): SQL | undefined {
  const values: SQL[] = [];
  const query = params.query?.trim();
  if (query) {
    values.push(
      or(
        ilike(billingEvents.webhookId, `%${query}%`),
        ilike(billingEvents.dodoSubscriptionId, `%${query}%`),
        ilike(users.email, `%${query}%`),
      )!,
    );
  }
  if (params.eventType) values.push(eq(billingEvents.eventType, params.eventType));
  if (params.applied === "applied") values.push(isNotNull(billingEvents.appliedAt));
  if (params.applied === "pending") values.push(isNull(billingEvents.appliedAt));
  return values.length > 0 ? and(...values) : undefined;
}

export async function listAdminBillingEvents(params: AdminBillingEventParams = {}): Promise<AdminBillingEventRow[]> {
  return await db
    .select({
      id: billingEvents.id,
      webhookId: billingEvents.webhookId,
      eventType: billingEvents.eventType,
      dodoSubscriptionId: billingEvents.dodoSubscriptionId,
      userId: billingEvents.userId,
      payload: billingEvents.payload,
      receivedAt: billingEvents.receivedAt,
      appliedAt: billingEvents.appliedAt,
      userEmail: users.email,
    })
    .from(billingEvents)
    .leftJoin(users, eq(users.id, billingEvents.userId))
    .where(conditions(params))
    .orderBy(desc(billingEvents.receivedAt))
    .limit(Math.min(params.limit ?? 100, 500))
    .offset(Math.max(params.offset ?? 0, 0));
}

export async function countAdminBillingEvents(params: AdminBillingEventParams = {}): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(billingEvents)
    .leftJoin(users, eq(users.id, billingEvents.userId))
    .where(conditions(params));
  return row?.count ?? 0;
}

export async function listBillingEventTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ eventType: billingEvents.eventType })
    .from(billingEvents)
    .orderBy(billingEvents.eventType)
    .limit(100);
  return rows.map((row) => row.eventType);
}

export async function getAdminBillingEventStats(): Promise<{
  total: number;
  received24h: number;
  pending: number;
  lastReceivedAt: Date | null;
}> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      received24h: sql<number>`count(*) filter (where ${billingEvents.receivedAt} > now() - interval '24 hours')::int`,
      pending: sql<number>`count(*) filter (where ${billingEvents.appliedAt} is null)::int`,
      lastReceivedAt: sql<Date | null>`max(${billingEvents.receivedAt})`,
    })
    .from(billingEvents);
  return {
    total: row?.total ?? 0,
    received24h: row?.received24h ?? 0,
    pending: row?.pending ?? 0,
    lastReceivedAt: row?.lastReceivedAt ?? null,
  };
}
