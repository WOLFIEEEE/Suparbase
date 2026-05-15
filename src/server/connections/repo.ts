import "server-only";
import { and, eq } from "drizzle-orm";
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
 */
export async function listConnections(userId: string): Promise<ConnectionSummary[]> {
  const owned = await db
    .select()
    .from(connections)
    .where(eq(connections.userId, userId));

  const memberRows = await db
    .select({ row: connections, role: connectionMembers.role })
    .from(connectionMembers)
    .innerJoin(connections, eq(connections.id, connectionMembers.connectionId))
    .where(eq(connectionMembers.userId, userId));

  const map = new Map<string, ConnectionSummary>();
  for (const r of owned) map.set(r.id, toSummary(r, "owner"));
  for (const { row, role } of memberRows) {
    // Owner status wins if both exist (shouldn't happen, but defensive).
    if (!map.has(row.id)) map.set(row.id, toSummary(row, role));
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
  );
}

/**
 * Resolve the caller's role on a connection, owner, member role, or null.
 * Use this when a route needs to know the caller's permissions.
 */
export async function getConnectionAccess(
  userId: string,
  id: string,
): Promise<{ conn: ConnectionRow; role: ConnectionRole } | null> {
  const [row] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, id))
    .limit(1);
  if (!row) return null;
  if (row.userId === userId) return { conn: row, role: "owner" };

  const [member] = await db
    .select()
    .from(connectionMembers)
    .where(
      and(
        eq(connectionMembers.connectionId, id),
        eq(connectionMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!member) return null;
  return { conn: row, role: member.role };
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

export async function touchLastUsed(id: string): Promise<void> {
  await db.update(connections).set({ lastUsedAt: new Date() }).where(eq(connections.id, id));
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
