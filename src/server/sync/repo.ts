import "server-only";
import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  syncProfiles,
  syncRuns,
  type SyncOptions,
  type SyncProfileRow,
  type SyncRunPhase,
  type SyncRunRow,
  type SyncRunStats,
  type SyncRunStatus,
  type SyncTableConfig,
} from "@/server/schema/sync";

// --- Profiles --------------------------------------------------------------

export interface CreateProfileInput {
  userId: string;
  name: string;
  baseConnectionId: string;
  targetConnectionId: string;
  options: SyncOptions;
  tableConfig: SyncTableConfig;
  scheduleIntervalHours?: number | null;
}

export async function createProfile(input: CreateProfileInput): Promise<SyncProfileRow> {
  const [row] = await db
    .insert(syncProfiles)
    .values({
      userId: input.userId,
      name: input.name,
      baseConnectionId: input.baseConnectionId,
      targetConnectionId: input.targetConnectionId,
      options: input.options,
      tableConfig: input.tableConfig,
      scheduleIntervalHours: input.scheduleIntervalHours ?? null,
    })
    .returning();
  return row!;
}

export async function listProfiles(
  userId: string,
  targetConnectionId: string,
): Promise<SyncProfileRow[]> {
  return db
    .select()
    .from(syncProfiles)
    .where(
      and(
        eq(syncProfiles.userId, userId),
        eq(syncProfiles.targetConnectionId, targetConnectionId),
      ),
    )
    .orderBy(desc(syncProfiles.updatedAt));
}

export async function getProfile(userId: string, id: string): Promise<SyncProfileRow | null> {
  const [row] = await db
    .select()
    .from(syncProfiles)
    .where(and(eq(syncProfiles.id, id), eq(syncProfiles.userId, userId)))
    .limit(1);
  return row ?? null;
}

export interface UpdateProfileInput {
  name?: string;
  baseConnectionId?: string;
  options?: SyncOptions;
  tableConfig?: SyncTableConfig;
  scheduleIntervalHours?: number | null;
}

export async function updateProfile(
  userId: string,
  id: string,
  patch: UpdateProfileInput,
): Promise<SyncProfileRow | null> {
  const [row] = await db
    .update(syncProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(syncProfiles.id, id), eq(syncProfiles.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteProfile(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(syncProfiles)
    .where(and(eq(syncProfiles.id, id), eq(syncProfiles.userId, userId)))
    .returning({ id: syncProfiles.id });
  return rows.length > 0;
}

// --- Runs ------------------------------------------------------------------

export interface CreateRunInput {
  userId: string;
  profileId: string | null;
  baseConnectionId: string;
  targetConnectionId: string;
  dryRun: boolean;
}

export async function createRun(input: CreateRunInput): Promise<SyncRunRow> {
  const [row] = await db
    .insert(syncRuns)
    .values({
      userId: input.userId,
      profileId: input.profileId,
      baseConnectionId: input.baseConnectionId,
      targetConnectionId: input.targetConnectionId,
      dryRun: input.dryRun,
      status: "running",
      phase: "introspect",
    })
    .returning();
  return row!;
}

export interface UpdateRunInput {
  status?: SyncRunStatus;
  phase?: SyncRunPhase | null;
  stats?: SyncRunStats;
  error?: string | null;
  finishedAt?: Date | null;
}

export async function updateRun(
  userId: string,
  id: string,
  patch: UpdateRunInput,
): Promise<void> {
  await db
    .update(syncRuns)
    .set(patch)
    .where(and(eq(syncRuns.id, id), eq(syncRuns.userId, userId)));
}

export async function getRun(userId: string, id: string): Promise<SyncRunRow | null> {
  const [row] = await db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.id, id), eq(syncRuns.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listRuns(
  userId: string,
  targetConnectionId: string,
  limit = 20,
): Promise<SyncRunRow[]> {
  return db
    .select()
    .from(syncRuns)
    .where(
      and(eq(syncRuns.userId, userId), eq(syncRuns.targetConnectionId, targetConnectionId)),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit);
}

/**
 * True when a non-dry run against this target is still `running` and young
 * enough to plausibly be alive. Runs older than the cutoff are treated as
 * crashed (a killed process can't flip its row to failed) so a stale row
 * can't wedge the schedule forever.
 */
export async function hasRecentRunningRun(
  userId: string,
  targetConnectionId: string,
  maxAgeHours = 2,
): Promise<boolean> {
  const [row] = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.userId, userId),
        eq(syncRuns.targetConnectionId, targetConnectionId),
        eq(syncRuns.status, "running"),
        eq(syncRuns.dryRun, false),
        sql`${syncRuns.startedAt} > now() - make_interval(hours => ${maxAgeHours})`,
      ),
    )
    .limit(1);
  return !!row;
}

/** Scheduled profiles whose interval has elapsed since their last scheduled run. */
export async function listDueProfiles(): Promise<SyncProfileRow[]> {
  return db
    .select()
    .from(syncProfiles)
    .where(
      and(
        isNotNull(syncProfiles.scheduleIntervalHours),
        or(
          isNull(syncProfiles.lastScheduledRunAt),
          sql`${syncProfiles.lastScheduledRunAt} < now() - make_interval(hours => ${syncProfiles.scheduleIntervalHours})`,
        ),
      ),
    );
}

export async function markScheduledRun(id: string): Promise<void> {
  await db
    .update(syncProfiles)
    .set({ lastScheduledRunAt: new Date() })
    .where(eq(syncProfiles.id, id));
}
