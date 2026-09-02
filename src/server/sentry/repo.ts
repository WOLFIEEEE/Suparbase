import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  sentryFindings,
  sentryScans,
  type FindingKind,
  type FindingSeverity,
  type FindingStatus,
  type SentryFindingRow,
  type SentryScanRow,
} from "@/server/schema/sentry";
import { AppError } from "@/lib/errors";

export interface FindingSummary {
  id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  status: FindingStatus;
  schemaName: string | null;
  tableName: string | null;
  columnName: string | null;
  details: SentryFindingRow["details"];
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  quarantinePolicyName: string | null;
}

export interface ScanSummary {
  id: string;
  startedAt: string;
  completedAt: string | null;
  tablesScanned: string[];
  findingsCount: number;
  error: string | null;
}

export function findingToSummary(row: SentryFindingRow): FindingSummary {
  return {
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    schemaName: row.schemaName,
    tableName: row.tableName,
    columnName: row.columnName,
    details: row.details ?? {},
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    quarantinePolicyName: row.quarantinePolicyName,
  };
}

export function scanToSummary(row: SentryScanRow): ScanSummary {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    tablesScanned: row.tablesScanned,
    findingsCount: Number.parseInt(row.findingsCount, 10) || 0,
    error: row.error,
  };
}

export async function listFindings(
  connectionId: string,
  opts: { status?: FindingStatus } = {},
): Promise<FindingSummary[]> {
  const filters = [
    eq(sentryFindings.connectionId, connectionId),
  ];
  if (opts.status) filters.push(eq(sentryFindings.status, opts.status));
  const rows = await db
    .select()
    .from(sentryFindings)
    .where(and(...filters))
    .orderBy(desc(sentryFindings.lastSeenAt));
  return rows.map(findingToSummary);
}

export async function listRecentScans(
  connectionId: string,
  limit = 10,
): Promise<ScanSummary[]> {
  const rows = await db
    .select()
    .from(sentryScans)
    .where(
      and(
        eq(sentryScans.connectionId, connectionId),
      ),
    )
    .orderBy(desc(sentryScans.startedAt))
    .limit(limit);
  return rows.map(scanToSummary);
}

export async function getFinding(
  connectionId: string,
  findingId: string,
): Promise<FindingSummary | null> {
  const [row] = await db
    .select()
    .from(sentryFindings)
    .where(
      and(
        eq(sentryFindings.id, findingId),
        eq(sentryFindings.connectionId, connectionId),
      ),
    )
    .limit(1);
  return row ? findingToSummary(row) : null;
}

export async function setFindingStatus(
  connectionId: string,
  findingId: string,
  status: FindingStatus,
): Promise<FindingSummary | null> {
  if (!["open", "acknowledged", "quarantined", "resolved"].includes(status)) {
    throw new AppError("validation", "Invalid status.");
  }
  const [row] = await db
    .update(sentryFindings)
    .set({
      status,
      lastSeenAt: new Date(),
      resolvedAt: status === "resolved" ? new Date() : null,
    })
    .where(
      and(
        eq(sentryFindings.id, findingId),
        eq(sentryFindings.connectionId, connectionId),
      ),
    )
    .returning();
  return row ? findingToSummary(row) : null;
}

export async function dismissResolvedFindings(
  connectionId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .delete(sentryFindings)
    .where(
      and(
        eq(sentryFindings.connectionId, connectionId),
        inArray(sentryFindings.id, ids),
      ),
    )
    .returning({ id: sentryFindings.id });
  return rows.length;
}
