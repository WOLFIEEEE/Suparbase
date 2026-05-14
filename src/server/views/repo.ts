import "server-only";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/server/db";
import { savedViews, type SavedViewRow } from "./schema";
import type { ViewState } from "@/lib/types/views";
import { AppError } from "@/lib/errors";

const MAX_PER_TABLE = 5;
const NAME_MIN = 1;
const NAME_MAX = 40;

/** Public-API shape: drops user_id / connection_id since the caller already knows them. */
export interface SavedViewSummary {
  id: string;
  name: string;
  state: ViewState;
  createdAt: string;
  updatedAt: string;
}

function toSummary(row: SavedViewRow): SavedViewSummary {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listViewsForTable(
  userId: string,
  connectionId: string,
  tableSchema: string,
  tableName: string,
): Promise<SavedViewSummary[]> {
  const rows = await db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.userId, userId),
        eq(savedViews.connectionId, connectionId),
        eq(savedViews.tableSchema, tableSchema),
        eq(savedViews.tableName, tableName),
      ),
    )
    .orderBy(asc(savedViews.createdAt));
  return rows.map(toSummary);
}

export interface CreateViewInput {
  userId: string;
  connectionId: string;
  tableSchema: string;
  tableName: string;
  name: string;
  state: ViewState;
}

export async function createView(input: CreateViewInput): Promise<SavedViewSummary> {
  const name = input.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new AppError("constraint", `View name must be ${NAME_MIN}–${NAME_MAX} characters.`, {
      columnHint: "name",
    });
  }
  const existing = await listViewsForTable(
    input.userId,
    input.connectionId,
    input.tableSchema,
    input.tableName,
  );
  if (existing.length >= MAX_PER_TABLE) {
    throw new AppError(
      "constraint",
      `Limit of ${MAX_PER_TABLE} views per table reached. Delete one before adding another.`,
      { columnHint: "name" },
    );
  }
  const [row] = await db
    .insert(savedViews)
    .values({
      userId: input.userId,
      connectionId: input.connectionId,
      tableSchema: input.tableSchema,
      tableName: input.tableName,
      name,
      state: input.state,
    })
    .returning();
  return toSummary(row!);
}

export interface UpdateViewInput {
  userId: string;
  id: string;
  name?: string;
  state?: ViewState;
}

export async function updateView(input: UpdateViewInput): Promise<SavedViewSummary | null> {
  if (input.name == null && input.state == null) {
    throw new AppError("constraint", "Provide at least one of `name` or `state`.");
  }
  const patch: Partial<typeof savedViews.$inferInsert> = { updatedAt: new Date() };
  if (input.name != null) {
    const trimmed = input.name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      throw new AppError("constraint", `View name must be ${NAME_MIN}–${NAME_MAX} characters.`, {
        columnHint: "name",
      });
    }
    patch.name = trimmed;
  }
  if (input.state != null) {
    patch.state = input.state;
  }
  const [row] = await db
    .update(savedViews)
    .set(patch)
    .where(and(eq(savedViews.id, input.id), eq(savedViews.userId, input.userId)))
    .returning();
  return row ? toSummary(row) : null;
}

export async function deleteView(userId: string, id: string): Promise<boolean> {
  const res = await db
    .delete(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.userId, userId)))
    .returning({ id: savedViews.id });
  return res.length > 0;
}
