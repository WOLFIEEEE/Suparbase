import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { connections, type ConnectionRow } from "@/server/schema/connections";
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
}

export function toSummary(row: ConnectionRow): ConnectionSummary {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    url: row.url,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

export async function listConnections(userId: string): Promise<ConnectionSummary[]> {
  const rows = await db
    .select()
    .from(connections)
    .where(eq(connections.userId, userId))
    .orderBy(desc(connections.lastUsedAt));
  return rows.map(toSummary);
}

export async function getConnectionForUser(userId: string, id: string): Promise<ConnectionRow | null> {
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

interface CreateInput {
  userId: string;
  name: string;
  url: string;
  hostname: string;
  key: string;
}

export async function createConnection(input: CreateInput): Promise<ConnectionSummary> {
  const role = decodeJwtRole(input.key);
  const encryptedKey = encryptKey(input.key);
  const [row] = await db
    .insert(connections)
    .values({
      userId: input.userId,
      name: input.name,
      url: input.url,
      hostname: input.hostname,
      role,
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
