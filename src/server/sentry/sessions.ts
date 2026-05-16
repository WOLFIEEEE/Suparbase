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

/**
 * Hot-path cache: in-memory map keyed by `${userId}:${connectionId}:${kind}`
 * so subsequent writes within the session window skip both the SELECT
 * and the bumping UPDATE on the agent_session table.
 *
 * Each entry stores the session id + last-seen-at-cache-time. When a
 * write comes in:
 *   1. If the cached entry is fresher than CACHE_TTL_MS, attribute
 *      the write to it instantly. Bump the cached `lastSeenAt` so a
 *      slow burst (one write every few minutes) keeps the same id.
 *   2. We still asynchronously bump the session row in the DB so the
 *      authoritative `mutation_count` + `tables_touched` stay accurate,
 *      fire-and-forget, never blocks the proxy reply.
 *   3. On a cache miss we hit the DB once, then prime the cache.
 *
 * Trade-offs + correctness:
 *   - The cache is per-process. Multiple Next.js / serverless instances
 *     get their own copies, so a session undo on one instance doesn't
 *     invalidate cached entries on others. To bound that window of
 *     incorrectness we keep CACHE_TTL_MS short (60s, well below the
 *     5-minute SESSION_WINDOW_MS). After 60s every instance re-checks
 *     the DB, so a closed/undone session can attract at most ~60s of
 *     mis-attributed writes per orphan cache.
 *   - Memory is hard-capped at MAX_CACHE_ENTRIES with simple LRU
 *     eviction on insert. Bounded under sustained load even if hot
 *     callers never trigger the cold-path opportunistic sweep.
 *   - For a single-instance Coolify deploy (the default) none of this
 *     matters — the cache is exact. The TTL exists only to keep
 *     multi-instance deployments correct enough.
 */
/** Cache TTL — kept well below SESSION_WINDOW_MS so cross-instance
 *  stale-cache windows are bounded to 60s in the worst case. */
const CACHE_TTL_MS = 60 * 1000;
/** Hard cap; LRU-evict on insert past this. Realistic upper bound for
 *  a single process serving several hundred concurrent user-sessions
 *  across a handful of connections + agent kinds. */
const MAX_CACHE_ENTRIES = 2048;

interface CachedSession {
  sessionId: string;
  kind: AgentKind;
  label: string;
  lastSeenAt: number;
}
// JS Map preserves insertion order, which we exploit for LRU: every
// time we read or write an entry, we delete + reinsert so the freshest
// key is at the tail. The oldest key (head) is the LRU eviction target.
const sessionCache = new Map<string, CachedSession>();

function cacheKey(userId: string, connectionId: string, kind: AgentKind): string {
  return `${userId}:${connectionId}:${kind}`;
}

function touchLru(key: string, entry: CachedSession): void {
  sessionCache.delete(key);
  sessionCache.set(key, entry);
}

function setLru(key: string, entry: CachedSession): void {
  if (sessionCache.size >= MAX_CACHE_ENTRIES) {
    // Map iteration order = insertion order, so the first key is LRU.
    const firstKey = sessionCache.keys().next().value;
    if (firstKey !== undefined) sessionCache.delete(firstKey);
  }
  sessionCache.set(key, entry);
}

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
 * insert. Never throws, the proxy hot-path is more important than
 * perfect attribution, so we swallow any DB error and return null.
 */
export async function attachToSession(
  input: AttachToSessionInput,
): Promise<AttachedSession | null> {
  try {
    const fp = fingerprintRequest(input.userAgent);
    const now = Date.now();
    const cutoff = new Date(now - SESSION_WINDOW_MS);
    const tableLabel = `${input.schemaName}.${input.tableName}`;
    const key = cacheKey(input.userId, input.connectionId, fp.kind);

    // ── Cache hot path ──────────────────────────────────────────────
    // TTL is intentionally short (60s) so cross-instance stale-cache
    // windows are bounded. See top-of-file comment for the trade-off.
    const cached = sessionCache.get(key);
    if (cached && now - cached.lastSeenAt < CACHE_TTL_MS) {
      // Refresh the timestamp + mark this key as most-recently-used.
      cached.lastSeenAt = now;
      touchLru(key, cached);
      const sessionId = cached.sessionId;
      void (async () => {
        try {
          await db
            .update(agentSessions)
            .set({
              mutationCount: sql`${agentSessions.mutationCount} + 1`,
              tablesTouched: sql`CASE WHEN ${tableLabel} = ANY(${agentSessions.tablesTouched}::text[]) THEN ${agentSessions.tablesTouched} ELSE array_append(${agentSessions.tablesTouched}, ${tableLabel}) END`,
              lastSeenAt: new Date(now),
            })
            .where(eq(agentSessions.id, sessionId));
        } catch {
          /* never let an audit-side error reach the proxy */
        }
      })();
      return { id: cached.sessionId, kind: cached.kind, label: cached.label };
    }

    // Opportunistically evict any other expired entries we noticed along
    // the way. Cheap: only iterates when the cache is non-trivial. The
    // hard cap above guarantees memory can't blow up; this just keeps
    // the working set fresh.
    if (sessionCache.size > 64) {
      for (const [k, v] of sessionCache) {
        if (now - v.lastSeenAt >= CACHE_TTL_MS) sessionCache.delete(k);
      }
    }

    // ── Cold path: hit the DB ──────────────────────────────────────
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

    if (existing) {
      await bumpSession(existing, tableLabel);
      setLru(key, {
        sessionId: existing.id,
        kind: existing.kind,
        label: existing.label,
        lastSeenAt: now,
      });
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
    setLru(key, {
      sessionId: created.id,
      kind: created.kind,
      label: created.label,
      lastSeenAt: now,
    });
    return { id: created.id, kind: created.kind, label: created.label };
  } catch (e) {
    // Hot-path failure should never block the user-visible response,
    // but we do want telemetry on it — without this, a silent crash
    // here means no audit attribution and no visible signal.
    const { log } = await import("@/server/log");
    log.warn("attachToSession failed (writes will land without session_id)", {
      err: e,
      userId: input.userId,
      connectionId: input.connectionId,
    });
    return null;
  }
}

/** Test-only helper: clear the cache between tests. */
export function _resetSessionCache(): void {
  sessionCache.clear();
}

async function bumpSession(row: AgentSessionRow, tableLabel: string): Promise<void> {
  // Compute the tables-touched union inside Postgres so two
  // concurrent writes can't stomp each other's tablesTouched (the
  // previous read-then-set form was racy: A reads [t1], B reads [t1],
  // A writes [t1,t2], B writes [t1,t3] → t2 is lost).
  // `tables_touched` is jsonb but stores a string[] — we round-trip
  // it as text[] for the union, then jsonb_agg() back.
  await db
    .update(agentSessions)
    .set({
      mutationCount: sql`${agentSessions.mutationCount} + 1`,
      tablesTouched: sql`
        CASE
          WHEN ${agentSessions.tablesTouched} @> ${JSON.stringify([tableLabel])}::jsonb
          THEN ${agentSessions.tablesTouched}
          ELSE ${agentSessions.tablesTouched} || ${JSON.stringify([tableLabel])}::jsonb
        END
      `,
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

  // Drop any cache entries pointing at this session, future writes
  // from the same fingerprint should open a fresh session.
  for (const [k, v] of sessionCache) {
    if (v.sessionId === sessionId) sessionCache.delete(k);
  }
}

/** Re-export for callers that need to fingerprint without attaching. */
export { type AgentFingerprint };
