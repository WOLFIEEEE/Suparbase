import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema/auth";
import { workspaceNotes } from "@/server/schema/notes";

export interface NoteSummary {
  id: string;
  tableName: string;
  primaryKey: Record<string, unknown> | null;
  body: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_PER_SCOPE = 100;

function pkCondition(primaryKey: Record<string, unknown> | null) {
  // jsonb equality is key-order-insensitive, so {a:1,b:2} matches {b:2,a:1}.
  return primaryKey === null
    ? isNull(workspaceNotes.primaryKey)
    : sql`${workspaceNotes.primaryKey} = ${JSON.stringify(primaryKey)}::jsonb`;
}

export async function listNotes(
  connectionId: string,
  tableName: string,
  primaryKey: Record<string, unknown> | null,
): Promise<NoteSummary[]> {
  const rows = await db
    .select({
      id: workspaceNotes.id,
      tableName: workspaceNotes.tableName,
      primaryKey: workspaceNotes.primaryKey,
      body: workspaceNotes.body,
      authorId: workspaceNotes.authorId,
      authorName: users.name,
      authorEmail: users.email,
      createdAt: workspaceNotes.createdAt,
      updatedAt: workspaceNotes.updatedAt,
    })
    .from(workspaceNotes)
    .leftJoin(users, eq(users.id, workspaceNotes.authorId))
    .where(
      and(
        eq(workspaceNotes.connectionId, connectionId),
        eq(workspaceNotes.tableName, tableName),
        pkCondition(primaryKey),
      ),
    )
    .orderBy(desc(workspaceNotes.createdAt))
    .limit(MAX_PER_SCOPE);
  return rows.map((r) => ({
    id: r.id,
    tableName: r.tableName,
    primaryKey: r.primaryKey ?? null,
    body: r.body,
    authorId: r.authorId,
    authorName: r.authorName ?? r.authorEmail ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function countNotesInScope(
  connectionId: string,
  tableName: string,
  primaryKey: Record<string, unknown> | null,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(workspaceNotes)
    .where(
      and(
        eq(workspaceNotes.connectionId, connectionId),
        eq(workspaceNotes.tableName, tableName),
        pkCondition(primaryKey),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function createNote(input: {
  connectionId: string;
  authorId: string;
  tableName: string;
  primaryKey: Record<string, unknown> | null;
  body: string;
}): Promise<string> {
  const [row] = await db
    .insert(workspaceNotes)
    .values({
      connectionId: input.connectionId,
      authorId: input.authorId,
      tableName: input.tableName,
      primaryKey: input.primaryKey,
      body: input.body,
    })
    .returning({ id: workspaceNotes.id });
  return row!.id;
}

/**
 * Delete a note. Authors can delete their own; owners can delete any note
 * on their connection (the route decides which case applies).
 */
export async function deleteNote(
  connectionId: string,
  id: string,
  opts: { authorId?: string },
): Promise<boolean> {
  const conds = [eq(workspaceNotes.connectionId, connectionId), eq(workspaceNotes.id, id)];
  if (opts.authorId) conds.push(eq(workspaceNotes.authorId, opts.authorId));
  const rows = await db
    .delete(workspaceNotes)
    .where(and(...conds))
    .returning({ id: workspaceNotes.id });
  return rows.length > 0;
}
