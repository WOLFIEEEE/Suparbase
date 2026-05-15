# Agent sessions + one-click undo (v3.1)

## Why
The second half of the Agent Sentry idea. v3.0 ships the security
watchdog. v3.1 ships the **safety net** for what already-trusted AI
agents do.

The 2026 incident pattern that v3.0 doesn't cover:

- PocketOS (April 2026): Cursor's Claude Opus agent deleted the
  production DB + backups in 9 seconds. Single-shot mass mutation
  from a single agent session.
- Replit Agent (July 2025): wiped a production DB during a
  conversation. Same shape.

In every case, the writes existed in some audit log somewhere, what
was missing was a button that said *"undo every change that agent
made in this session"*. v3.1 builds that button.

## What ships

### Schema
- `agent_session` table (drizzle migration 0010): id, user_id,
  connection_id, kind, label, user_agent_raw, started_at, last_seen_at,
  closed_at, status, mutation_count, tables_touched, undo accounting
  columns (attempted / reverted / error).
- `audit_log.session_id` column + index. Every write the proxy
  audits now links back to the session that produced it.

### Fingerprinter (`src/server/sentry/fingerprint.ts`)
Recognises 7 AI tools by User-Agent:
- `cursor/<version>` → Cursor IDE
- `claude-code/<version>` → Claude Code CLI
- `Replit-Agent` → Replit Agent
- `Lovable` / `lovable.dev` → Lovable
- `v0` / `v0-vercel` → v0
- `vercel-ai-sdk` / `ai-sdk` → Vercel AI SDK
- `OpenRouter` → Suparbase AI's own OpenRouter calls

Falls through to `ai_unknown` when the UA mentions LLM-like terms
(openai / anthropic / claude / gpt / llm / copilot / agent / bot),
or to `browser` / `cli` / `unknown` otherwise.

### Session bucketing (`src/server/sentry/sessions.ts`)
- `attachToSession()` is called from the proxy `forward.ts` on every
  authenticated write.
- 5-minute rolling window: consecutive writes from the same
  (user, connection, kind) extend an existing active session.
- Outside the window or to a different kind, a new session opens.
- Session counters (`mutationCount`, `tablesTouched`) are bumped via
  an atomic `UPDATE … SET mutation_count = mutation_count + 1`.
- Never throws, proxy hot path is more important than perfect
  attribution.

### Proxy integration
- `src/server/proxy/forward.ts` reads the inbound `User-Agent`
  before the audit-log block, calls `attachToSession()` in parallel
  with `extractAuditFromRequest()`, then stamps the resulting
  `sessionId` onto every `auditWrite()`.
- All existing audit semantics preserved, we never block the
  user-visible response on session work.

### Undo engine (`src/server/sentry/undo.ts`)
- Loads every `audit_log` row tagged with the session.
- Builds a reverse SQL statement per row:
  - `insert` → `DELETE FROM <table> WHERE <pk>`
  - `update` → `UPDATE <table> SET <beforeRow cols> WHERE <pk>`
  - `delete` → `INSERT INTO <table> (cols) VALUES (...)`
- Runs every reversal in a single transaction via `executeSql()` so
  partial failures roll back.
- Bypasses RLS via the Direct Postgres URL, this is an admin
  operation the user explicitly authorised.
- Schema mutations (DDL) are out of scope; we don't yet capture them
  in the audit log. A follow-up will catch DDL via `pg_event_trigger`.

### UI
- New `/c/[id]/agents` page in the workspace sidebar.
- Sessions grouped by agent kind in reverse-chronological order.
- Row click opens a side drawer with:
  - Session summary (mutation count, tables touched, time range, status).
  - Mutation list (verb + table + PK + timestamp).
  - Raw `User-Agent` in a collapsible.
  - **"Undo session"** button (red-tone), disabled if the session has
    no writes, has already been undone, or the connection has no
    Direct Postgres URL.
- Confirm dialog before undo. Result toast shows
  `Reversed N of M mutations`.

### API
- `GET /api/connections/[id]/sessions` → list + canUndo
- `GET /api/connections/[id]/sessions/[sessionId]` → one + full writes
- `POST /api/connections/[id]/sessions/[sessionId]/undo` → reverse

## Out of scope for v3.1
- **DDL capture + reverse**, schema changes (ALTER TABLE, DROP, etc.)
  aren't audited yet, so they can't be undone. v3.1.x will add
  `pg_event_trigger`-driven capture + an "auto-generated reverse
  migration" suggestion for the simple cases.
- **Session-level alerting**, emailing the owner when an AI session
  mutates more than N rows / hits a sensitive table.
- **Per-session diff preview** before undo. The mutation list shows
  the verbs + PKs but not the per-column before/after diff. The data
  is already in `audit_log.beforeRow` / `afterRow` so this is a UI-
  only follow-up.

## Safety
- Undo requires Direct Postgres URL. We're explicit in UI about why.
- Reversals run in one transaction, either all succeed or none.
- We never include the AI's original key in the reverse SQL; we only
  re-execute SQL we constructed from the audit log snapshots.
- Sessions that have already been undone are blocked from re-undo.
