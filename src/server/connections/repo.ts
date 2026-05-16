import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { connections, type ConnectionRow } from "@/server/schema/connections";
import { connectionMembers, type ConnectionRole } from "@/server/schema/team";
import { encryptKey } from "@/server/crypto/vault";
import { decodeJwtRole, type KeyRole } from "./jwt";

export interface ConnectionSummary {
  id: string;
  name: string;
  hostname: string;
  url: string;
  role: KeyRole;
  createdAt: string;
  lastUsedAt: string;
  hasPostgresUrl: boolean;
  /** Caller's role on this connection: owner / editor / viewer. */
  myRole?: ConnectionRole;
}

export function toSummary(row: ConnectionRow, myRole?: ConnectionRole): ConnectionSummary {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    url: row.url,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    hasPostgresUrl: row.encryptedPostgresUrl !== null && row.encryptedPostgresUrl !== undefined,
    myRole,
  };
}

/**
 * Returns every connection the user has access to: those they own
 * and those they're a member of, with the caller's effective role.
 * The owned/member queries both push their ORDER BY into Postgres
 * via the (user_id, last_used_at DESC) index — no JS sort needed,
 * the final merge preserves order because both inputs are sorted.
 */
export async function listConnections(userId: string): Promise<ConnectionSummary[]> {
  const owned = await db
    .select()
    .from(connections)
    .where(eq(connections.userId, userId))
    .orderBy(desc(connections.lastUsedAt));

  const memberRows = await db
    .select({ row: connections, role: connectionMembers.role })
    .from(connectionMembers)
    .innerJoin(connections, eq(connections.id, connectionMembers.connectionId))
    .where(eq(connectionMembers.userId, userId))
    .orderBy(desc(connections.lastUsedAt));

  // Merge with owner-status winning. Both inputs are already in
  // last_used_at DESC order from Postgres; we re-sort only because
  // the merge interleaves them.
  const map = new Map<string, ConnectionSummary>();
  for (const r of owned) map.set(r.id, toSummary(r, "owner"));
  for (const { row, role } of memberRows) {
    if (!map.has(row.id)) map.set(row.id, toSummary(row, role));
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
  );
}

/**
 * Resolve the caller's role on a connection: owner, member role, or
 * null. One LEFT JOIN against `connection_member` rather than two
 * sequential round-trips — this is on the critical path of every
 * protected API route, so the saved hop matters.
 */
export async function getConnectionAccess(
  userId: string,
  id: string,
): Promise<{ conn: ConnectionRow; role: ConnectionRole } | null> {
  const rows = await db
    .select({
      conn: connections,
      memberRole: connectionMembers.role,
    })
    .from(connections)
    .leftJoin(
      connectionMembers,
      and(
        eq(connectionMembers.connectionId, connections.id),
        eq(connectionMembers.userId, userId),
      ),
    )
    .where(eq(connections.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.conn.userId === userId) return { conn: row.conn, role: "owner" };
  if (!row.memberRole) return null;
  return { conn: row.conn, role: row.memberRole };
}

/**
 * Backwards-compatible accessor used by every protected route. Returns
 * the connection if the caller is the owner OR any member of it.
 */
export async function getConnectionForUser(userId: string, id: string): Promise<ConnectionRow | null> {
  const access = await getConnectionAccess(userId, id);
  return access?.conn ?? null;
}

const ROLE_RANK: Record<ConnectionRole, number> = { viewer: 0, editor: 1, owner: 2 };

/** Asserts the caller has at least the given role; otherwise returns null. */
export async function requireRole(
  userId: string,
  id: string,
  minRole: ConnectionRole,
): Promise<{ conn: ConnectionRow; role: ConnectionRole } | null> {
  const access = await getConnectionAccess(userId, id);
  if (!access) return null;
  if (ROLE_RANK[access.role] < ROLE_RANK[minRole]) return null;
  return access;
}

interface CreateInput {
  userId: string;
  name: string;
  url: string;
  hostname: string;
  key: string;
  /** Optional direct Postgres URL, unlocks RLS debugger, SQL playground, sessions inspector. */
  postgresUrl?: string | null;
}

export async function createConnection(input: CreateInput): Promise<ConnectionSummary> {
  const role = decodeJwtRole(input.key);
  const encryptedKey = encryptKey(input.key);
  const encryptedPostgresUrl =
    input.postgresUrl && input.postgresUrl.length > 0
      ? encryptKey(input.postgresUrl)
      : null;
  const [row] = await db
    .insert(connections)
    .values({
      userId: input.userId,
      name: input.name,
      url: input.url,
      hostname: input.hostname,
      role,
      encryptedPostgresUrl,
      encryptedKey,
    })
    .returning();
  return toSummary(row!);
}

export async function renameConnection(userId: string, id: string, name: string): Promise<ConnectionSummary | null> {
  const [row] = await db
    .update(connections)
    .set({ name })
    .where(and(eq(connections.id, id), eq(connections.userId, userId)))
    .returning();
  return row ? toSummary(row) : null;
}

export async function deleteConnection(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(connections)
    .where(and(eq(connections.id, id), eq(connections.userId, userId)))
    .returning({ id: connections.id });
  return rows.length > 0;
}

/**
 * Bump `last_used_at` — but only if the row is more than 60s stale.
 * This call runs on every successful proxied write, which on a busy
 * connection means contending on the same row lock + writing WAL for
 * a value the UI displays at minute-resolution anyway. The 60s
 * threshold cuts the write rate from "every request" to "at most
 * once per minute per connection" with no user-visible change.
 */
const TOUCH_THROTTLE_MS = 60_000;
export async function touchLastUsed(id: string): Promise<void> {
  const now = new Date();
  const threshold = new Date(now.getTime() - TOUCH_THROTTLE_MS);
  await db
    .update(connections)
    .set({ lastUsedAt: now })
    .where(and(eq(connections.id, id), lt(connections.lastUsedAt, threshold)));
}

/**
 * Store or clear the optional direct-Postgres URL on a connection. Used by
 * the RLS debugger.
 */
export async function setPostgresUrl(
  userId: string,
  id: string,
  url: string | null,
): Promise<ConnectionSummary | null> {
  const value = url ? encryptKey(url) : null;
  const [row] = await db
    .update(connections)
    .set({ encryptedPostgresUrl: value })
    .where(and(eq(connections.id, id), eq(connections.userId, userId)))
    .returning();
  return row ? toSummary(row) : null;
}
