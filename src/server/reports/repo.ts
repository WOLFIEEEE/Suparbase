import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { scheduledReports, sqlSnippets, type ReportDelivery } from "@/server/schema";
import type { ScheduledReportRow } from "@/server/schema/scheduled-reports";

export interface CreateReportInput {
  userId: string;
  connectionId: string;
  snippetId: string;
  name: string;
  delivery: ReportDelivery;
  target: string;
  intervalHours: number;
}

export async function createReport(input: CreateReportInput): Promise<ScheduledReportRow> {
  const [row] = await db.insert(scheduledReports).values(input).returning();
  return row!;
}

export async function listReports(
  userId: string,
  connectionId: string,
): Promise<ScheduledReportRow[]> {
  return db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.userId, userId), eq(scheduledReports.connectionId, connectionId)))
    .orderBy(desc(scheduledReports.createdAt));
}

export async function getReport(userId: string, id: string): Promise<ScheduledReportRow | null> {
  const [row] = await db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.id, id), eq(scheduledReports.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function deleteReport(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(scheduledReports)
    .where(and(eq(scheduledReports.id, id), eq(scheduledReports.userId, userId)))
    .returning({ id: scheduledReports.id });
  return rows.length > 0;
}

export async function setReportEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const rows = await db
    .update(scheduledReports)
    .set({ enabled })
    .where(and(eq(scheduledReports.id, id), eq(scheduledReports.userId, userId)))
    .returning({ id: scheduledReports.id });
  return rows.length > 0;
}

/** The snippet SQL a report runs (joined for the cron + preview). */
export async function reportSnippetSql(report: ScheduledReportRow): Promise<string | null> {
  const [row] = await db
    .select({ sql: sqlSnippets.sql })
    .from(sqlSnippets)
    .where(eq(sqlSnippets.id, report.snippetId))
    .limit(1);
  return row?.sql ?? null;
}

/** Enabled reports whose interval has elapsed since their last run. */
export async function listDueReports(): Promise<ScheduledReportRow[]> {
  return db
    .select()
    .from(scheduledReports)
    .where(
      and(
        eq(scheduledReports.enabled, true),
        or(
          isNull(scheduledReports.lastRunAt),
          sql`${scheduledReports.lastRunAt} < now() - make_interval(hours => ${scheduledReports.intervalHours})`,
        ),
      ),
    )
    .orderBy(asc(scheduledReports.lastRunAt));
}

export async function markReportRun(
  id: string,
  status: string,
  error: string | null,
): Promise<void> {
  await db
    .update(scheduledReports)
    .set({ lastRunAt: new Date(), lastStatus: status, lastError: error })
    .where(eq(scheduledReports.id, id));
}
