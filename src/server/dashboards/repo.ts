import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dashboardWidgets,
  type DashboardWidgetRow,
  type WidgetSpan,
  type WidgetType,
  type WidgetVisConfig,
} from "@/server/schema/dashboard-widgets";
import { AppError } from "@/lib/errors";

const TITLE_MIN = 1;
const TITLE_MAX = 60;
const DESC_MAX = 200;
const SQL_MAX = 4_000;
const MAX_PER_CONNECTION = 24;

export interface WidgetSummary {
  id: string;
  type: WidgetType;
  title: string;
  description: string | null;
  sql: string;
  visConfig: WidgetVisConfig;
  position: number;
  span: WidgetSpan;
  refreshSec: number;
  createdAt: string;
  updatedAt: string;
}

export function toSummary(row: DashboardWidgetRow): WidgetSummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    sql: row.sql,
    visConfig: row.visConfig ?? {},
    position: row.position,
    span: row.span,
    refreshSec: row.refreshSec,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface WidgetInput {
  type: WidgetType;
  title: string;
  description?: string | null;
  sql: string;
  visConfig?: WidgetVisConfig;
  position?: number;
  span?: WidgetSpan;
  refreshSec?: number;
}

function validate(input: WidgetInput): void {
  if (input.title.trim().length < TITLE_MIN || input.title.length > TITLE_MAX) {
    throw new AppError("validation", `Title must be 1–${TITLE_MAX} characters.`);
  }
  if (input.description && input.description.length > DESC_MAX) {
    throw new AppError("validation", `Description must be ≤ ${DESC_MAX} characters.`);
  }
  if (!input.sql.trim()) {
    throw new AppError("validation", "SQL is required.");
  }
  if (input.sql.length > SQL_MAX) {
    throw new AppError("validation", `SQL must be ≤ ${SQL_MAX} characters.`);
  }
  if (input.refreshSec != null && (input.refreshSec < 0 || input.refreshSec > 3600)) {
    throw new AppError("validation", "Refresh interval must be 0–3600 seconds.");
  }
}

export async function listWidgets(
  _userId: string,
  connectionId: string,
): Promise<WidgetSummary[]> {
  const rows = await db
    .select()
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.connectionId, connectionId))
    .orderBy(asc(dashboardWidgets.position), asc(dashboardWidgets.createdAt));
  return rows.map(toSummary);
}

export async function getWidget(
  _userId: string,
  connectionId: string,
  widgetId: string,
): Promise<WidgetSummary | null> {
  const [row] = await db
    .select()
    .from(dashboardWidgets)
    .where(
      and(
        eq(dashboardWidgets.id, widgetId),
        eq(dashboardWidgets.connectionId, connectionId),
      ),
    )
    .limit(1);
  return row ? toSummary(row) : null;
}

export async function createWidget(
  userId: string,
  connectionId: string,
  input: WidgetInput,
): Promise<WidgetSummary> {
  validate(input);
  const existing = await listWidgets(userId, connectionId);
  if (existing.length >= MAX_PER_CONNECTION) {
    throw new AppError(
      "validation",
      `You already have ${MAX_PER_CONNECTION} widgets on this connection.`,
    );
  }
  const nextPosition =
    input.position ??
    (existing.length === 0 ? 0 : Math.max(...existing.map((w) => w.position)) + 1);

  const [row] = await db
    .insert(dashboardWidgets)
    .values({
      userId,
      connectionId,
      type: input.type,
      title: input.title.trim(),
      description: input.description ?? null,
      sql: input.sql,
      visConfig: input.visConfig ?? {},
      position: nextPosition,
      span: input.span ?? "1",
      refreshSec: input.refreshSec ?? 0,
    })
    .returning();
  return toSummary(row);
}

export async function updateWidget(
  _userId: string,
  connectionId: string,
  widgetId: string,
  input: WidgetInput,
): Promise<WidgetSummary | null> {
  validate(input);
  const [row] = await db
    .update(dashboardWidgets)
    .set({
      type: input.type,
      title: input.title.trim(),
      description: input.description ?? null,
      sql: input.sql,
      visConfig: input.visConfig ?? {},
      position: input.position ?? 0,
      span: input.span ?? "1",
      refreshSec: input.refreshSec ?? 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dashboardWidgets.id, widgetId),
        eq(dashboardWidgets.connectionId, connectionId),
      ),
    )
    .returning();
  return row ? toSummary(row) : null;
}

export async function deleteWidget(
  _userId: string,
  connectionId: string,
  widgetId: string,
): Promise<boolean> {
  const res = await db
    .delete(dashboardWidgets)
    .where(
      and(
        eq(dashboardWidgets.id, widgetId),
        eq(dashboardWidgets.connectionId, connectionId),
      ),
    )
    .returning({ id: dashboardWidgets.id });
  return res.length > 0;
}
