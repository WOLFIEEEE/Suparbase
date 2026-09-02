import "server-only";
import { and, count, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "@/server/db";
import { connections } from "@/server/schema/connections";
import { connectionMembers } from "@/server/schema/team";
import { notifications, type NotificationKind } from "@/server/schema/notifications";
import { log } from "@/server/log";

/** Newest notifications kept per user; older ones are pruned on insert. */
const MAX_PER_USER = 200;
const LIST_LIMIT = 50;

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  connectionId?: string | null;
}

export interface NotificationSummary {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  connectionId: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Insert one row per recipient. Never throws: notifications are a
 * side-channel and must not fail the scan / cron / invite that raised them.
 */
export async function notifyUsers(userIds: string[], input: NotifyInput): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await db.insert(notifications).values(
      unique.map((userId) => ({
        userId,
        connectionId: input.connectionId ?? null,
        kind: input.kind,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 1000) ?? null,
        href: input.href ?? null,
      })),
    );
    await Promise.all(unique.map(pruneForUser));
  } catch (e) {
    log.warn("notification insert failed", { kind: input.kind, err: e });
  }
}

/** Everyone with access to a connection: the owner plus every member. */
export async function connectionRecipients(connectionId: string): Promise<string[]> {
  const [owner] = await db
    .select({ userId: connections.userId })
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1);
  if (!owner) return [];
  const members = await db
    .select({ userId: connectionMembers.userId })
    .from(connectionMembers)
    .where(eq(connectionMembers.connectionId, connectionId));
  return [owner.userId, ...members.map((m) => m.userId)];
}

/** Notify the owner and every member of a connection. */
export async function notifyConnection(
  connectionId: string,
  input: Omit<NotifyInput, "connectionId">,
  opts: { excludeUserId?: string | null } = {},
): Promise<void> {
  try {
    const recipients = (await connectionRecipients(connectionId)).filter((id) => id !== opts.excludeUserId);
    await notifyUsers(recipients, { ...input, connectionId });
  } catch (e) {
    log.warn("notification fan-out failed", { connectionId, kind: input.kind, err: e });
  }
}

async function pruneForUser(userId: string): Promise<void> {
  const keep = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(MAX_PER_USER);
  if (keep.length < MAX_PER_USER) return;
  await db.delete(notifications).where(
    and(eq(notifications.userId, userId), notInArray(notifications.id, keep.map((k) => k.id))),
  );
}

function toSummary(row: typeof notifications.$inferSelect): NotificationSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    connectionId: row.connectionId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listNotifications(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? LIST_LIMIT, 1), LIST_LIMIT);
  const conds = [eq(notifications.userId, userId)];
  if (opts.unreadOnly) conds.push(isNull(notifications.readAt));
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map(toSummary);
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

/** Mark specific notifications (or all, when `ids` is empty) as read. */
export async function markRead(userId: string, ids: string[]): Promise<number> {
  const conds = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (ids.length > 0) conds.push(inArray(notifications.id, ids));
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conds))
    .returning({ id: notifications.id });
  return rows.length;
}
