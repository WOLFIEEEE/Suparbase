import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  agentSessions,
  type AgentKind,
  type AgentSessionRow,
  type SessionStatus,
} from "@/server/schema/agent-sessions";
import { fingerprintRequest, type AgentFingerprint } from "./fingerprint";

/**
 * Window during which consecutive writes from the same (user, conn,
 * agent_kind, ua) extend the existing session instead of starting a
 * new one. Tuned so an AI agent making a 30-mutation refactor lands
 * in a single bucket the user can undo with one click.
 */
const SESSION_WINDOW_MS = 5 * 60 * 1000;

export interface AttachToSessionInput {
  userId: string;
  connectionId: string;
  userAgent: string | null;
  /** Bumped each time a write happens. */
  schemaName: string;
  tableName: string;
}

export interface AttachedSession {
  id: string;
  kind: AgentKind;
  label: string;
}

/**
 * Reserve a session slot for the incoming write and bump its counters.
 * Returns the session id so the caller can stamp it on the audit_log
 * insert. Never throws — the proxy hot-path is more important than
 * perfect attribution, so we swallow any DB error and return null.
 */
export async function attachToSession(
  input: AttachToSessionInput,
): Promise<AttachedSession | null> {
  try {
    const fp = fingerprintRequest(input.userAgent);
    const cutoff = new Date(Date.now() - SESSION_WINDOW_MS);

    // Find the most recent open session for this (user, conn, kind).
    const [existing] = await db
      .select()
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.userId, input.userId),
          eq(agentSessions.connectionId, input.connectionId),
          eq(agentSessions.kind, fp.kind),
          eq(agentSessions.status, "active"),
          gt(agentSessions.lastSeenAt, cutoff),
        ),
      )
      .orderBy(desc(agentSessions.lastSeenAt))
      .limit(1);

    const tableLabel = `${input.schemaName}.${input.tableName}`;

    if (existing) {
      await bumpSession(existing, tableLabel);
      return { id: existing.id, kind: existing.kind, label: existing.label };
    }

    const [created] = await db
      .insert(agentSessions)
      .values({
        userId: input.userId,
        connectionId: input.connectionId,
        kind: fp.kind,
        label: fp.label,
        userAgentRaw: input.userAgent?.slice(0, 500) ?? null,
        mutationCount: 1,
        tablesTouched: [tableLabel],
      })
      .returning();
    return { id: created.id, kind: created.kind, label: created.label };
  } catch {
    return null;
  }
}

async function bumpSession(row: AgentSessionRow, tableLabel: string): Promise<void> {
  const nextTables = row.tablesTouched.includes(tableLabel)
    ? row.tablesTouched
    : [...row.tablesTouched, tableLabel];
  await db
    .update(agentSessions)
    .set({
      mutationCount: sql`${agentSessions.mutationCount} + 1`,
      tablesTouched: nextTables,
      lastSeenAt: new Date(),
    })
    .where(eq(agentSessions.id, row.id));
}

// ---------------------------------------------------------------------------
// Public read helpers
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  kind: AgentKind;
  label: string;
  userAgentRaw: string | null;
  startedAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  status: SessionStatus;
  mutationCount: number;
  tablesTouched: string[];
  undoAttemptedCount: number;
  undoRevertedCount: number;
  undoError: string | null;
}

export function toSummary(row: AgentSessionRow): SessionSummary {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    userAgentRaw: row.userAgentRaw,
    startedAt: row.startedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    status: row.status,
    mutationCount: row.mutationCount,
    tablesTouched: row.tablesTouched,
    undoAttemptedCount: row.undoAttemptedCount,
    undoRevertedCount: row.undoRevertedCount,
    undoError: row.undoError,
  };
}

export async function listSessions(
  userId: string,
  connectionId: string,
  limit = 50,
): Promise<SessionSummary[]> {
  const rows = await db
    .select()
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.userId, userId),
        eq(agentSessions.connectionId, connectionId),
      ),
    )
    .orderBy(desc(agentSessions.lastSeenAt))
    .limit(limit);
  return rows.map(toSummary);
}

export async function getSession(
  userId: string,
  connectionId: string,
  sessionId: string,
): Promise<SessionSummary | null> {
  const [row] = await db
    .select()
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.id, sessionId),
        eq(agentSessions.userId, userId),
        eq(agentSessions.connectionId, connectionId),
      ),
    )
    .limit(1);
  return row ? toSummary(row) : null;
}

export async function markUndoResult(
  sessionId: string,
  result: {
    attempted: number;
    reverted: number;
    error?: string | null;
  },
): Promise<void> {
  let status: SessionStatus;
  if (result.error) status = "undo_failed";
  else if (result.reverted === result.attempted) status = "undone";
  else status = "undo_partial";

  await db
    .update(agentSessions)
    .set({
      status,
      closedAt: new Date(),
      undoAttemptedCount: result.attempted,
      undoRevertedCount: result.reverted,
      undoError: result.error ?? null,
    })
    .where(eq(agentSessions.id, sessionId));
}

/** Re-export for callers that need to fingerprint without attaching. */
export { type AgentFingerprint };
