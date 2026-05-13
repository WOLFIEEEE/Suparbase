# Feature Specification: AI-augmented admin presets

**Feature Branch**: `003-ai-augmented-admin`
**Created**: 2026-05-13
**Status**: Draft
**Input**: User description: "Use OpenRouter keys. Fetch the schema from
the database, analyse it using AI, and have a few prebuilt admin pages
that we route the user into based on what the AI says each table is."

## User Scenarios & Testing

### User Story 1 — Add an OpenRouter key (P1)

A user adds their OpenRouter API key to their Suparbase account.

**Acceptance**:
1. On `/settings/ai`, the user pastes a key starting with `sk-or-…` and
   submits. The key is verified by a single OpenRouter `/models` call.
2. On success the key is AES-256-GCM encrypted at rest. The API
   response body MUST NOT contain the plaintext key.
3. The user can change the default model in the same form (free-form
   text, e.g. `anthropic/claude-3.5-haiku`).
4. The user can clear the key with one click; the row is overwritten
   and removed.

### User Story 2 — AI classifies each table (P1)

After connecting a Supabase project, the user sees AI-suggested
classification on the dashboard and per-table view.

**Acceptance**:
1. With an OpenRouter key configured, the dashboard tile for each table
   shows an AI-derived **category** badge (Users / Content / Logs /
   Generic) and a **display name** in Title Case.
2. The analysis runs once per schema fingerprint and is cached;
   re-loading the dashboard does NOT spend more tokens.
3. Without an OpenRouter key, the dashboard renders identically to v0.2
   — no badges, no "AI suggested" text, no errors.
4. If the AI call fails or returns malformed JSON, the dashboard still
   renders; the badge area is empty. An "AI analysis unavailable" hint
   appears on `/settings/ai` only.

### User Story 3 — Tables open in a purpose-built preset (P1)

When the user clicks a table, Suparbase routes them to the preset that
matches the AI-derived category, rather than always rendering the
generic CRUD page.

**Acceptance**:
1. Tables classified as **Users** open `UsersAdmin`: avatar + email
   first, role/status as chips, "Suspend" / "Promote" actions where
   columns suggest them, generic create form for new users.
2. Tables classified as **Content** open `ContentAdmin`: title +
   excerpt, status pill (draft / published), published-at column
   emphasized, optional preview pane.
3. Tables classified as **Logs** open `LogsAdmin`: reverse-chronological
   read-only table, JSON columns expanded inline, no create/edit/delete
   actions, filter by event type if a category-like column exists.
4. Tables classified as **Generic** (or unclassified) fall through to
   the v0.2 generic CRUD experience — no regression.
5. A "Switch to generic view" link is always available on a preset
   page, so users can override the AI suggestion per session.

### User Story 4 — Cost transparency (P2)

The user sees, in Settings, the model used and approximate token spend
for their most recent schema analysis.

**Acceptance**:
1. `/settings/ai` shows: last-run timestamp, model name, prompt tokens,
   completion tokens, total tokens.
2. The user can trigger a fresh re-analysis manually ("Re-analyze
   schema") which invalidates the cache.

## Functional Requirements

### Key handling

- **FR-001**: Users MUST be able to add, replace, and remove their
  OpenRouter API key via `/settings/ai`.
- **FR-002**: The OpenRouter key MUST be encrypted at rest via the
  shared AES-256-GCM vault. The plaintext MUST never persist to disk.
- **FR-003**: API responses about the key MUST NOT include the
  plaintext.
- **FR-004**: The default model MUST be stored alongside the key (text
  column, default `anthropic/claude-3.5-haiku`).

### Schema analysis

- **FR-010**: The analyzer MUST send the LLM only schema metadata
  (table name, kind, columns: name + pgType + nullable + isPK + fk
  target + comment). NEVER row contents.
- **FR-011**: The analyzer MUST require the user's OpenRouter key. If
  absent, the analyzer MUST return a `not_configured` outcome the
  caller treats as "AI unavailable", not as an error.
- **FR-012**: The analyzer MUST validate the LLM response against a
  Zod schema. Malformed responses MUST be discarded; cache MUST NOT
  be polluted.
- **FR-013**: Results MUST be cached per `(user_id, connection_id,
  schema_fingerprint)`. The fingerprint is a SHA-256 of the sorted
  list of `${schema}.${table}|${col}:${pgType}` lines.
- **FR-014**: Analysis MUST be rate-limited: 10 fresh analyses per
  user per hour. Cached reads do not count.

### Routing & presets

- **FR-020**: The per-table page MUST consult the cached analysis to
  pick a preset. When no analysis is available, GenericAdmin is used.
- **FR-021**: The preset selector MUST be a pure function of `(table,
  analysis)` and exposed at `src/lib/presets/pick.ts`.
- **FR-022**: Each preset (UsersAdmin, ContentAdmin, LogsAdmin) MUST
  render on top of the same DataGrid / RowForm primitives used by
  GenericAdmin — no parallel data layer.
- **FR-023**: A "Switch to generic view" link MUST be available on
  every preset page; the override is per-session and stored in the
  URL (`?view=generic`).

### Cost transparency

- **FR-030**: Each analysis call's usage metrics (prompt_tokens,
  completion_tokens, total_tokens, model, finished_at) MUST be stored
  alongside the cached analysis.
- **FR-031**: `/settings/ai` MUST display the last analysis's
  metrics and a manual "Re-analyze schema" button.

### Cross-cutting

- **FR-040**: The OpenRouter key MUST never appear in any log,
  network response payload, or stack trace surface. The redactor MUST
  recognize `sk-or-…` shapes in addition to JWT shapes.
- **FR-041**: AI features MUST be discoverable but not nagging — no
  modals demanding the user add a key.
- **FR-042**: GenericAdmin MUST be the fallback for every failure
  mode, with no functional regression vs v0.2.

## Success Criteria

- **SC-001**: With an OpenRouter key, a 20-table schema is analyzed
  and classified within 6 seconds (most of which is the LLM call).
- **SC-002**: Cached analysis lookups complete in under 50ms on the
  server (database round-trip only).
- **SC-003**: Across a sample of 3 real Supabase projects (one
  blog-shaped, one SaaS-shaped, one log-heavy), at least 80% of
  tables are routed to a non-generic preset that improves on the
  generic experience.
- **SC-004**: With no OpenRouter key, every page renders identically
  to v0.2.
- **SC-005**: Bundle: adding AI features adds ≤ 30 KB gz to any first
  paint. (Presets are lazy-loaded.)

## Out of scope (v1.0 of this feature)

- Multi-provider AI (OpenAI direct, Anthropic direct). OpenRouter
  only.
- Streaming UI for AI suggestions; we run analysis as a single
  request/response.
- Natural-language query → PostgREST filter generation (v0.3.1).
- AI-generated form layouts beyond the existing data-driven logic.
- Per-row AI summaries.
