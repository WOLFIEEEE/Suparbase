# Database sync: base → target (v3.14)

> **Status:** Phases 1–3 implemented (`src/server/sync/*`, `/c/[id]/sync`,
> `/api/connections/[id]/sync/*`, `/api/cron/sync`, migrations 0018/0019).
> Verified by typecheck + production build; **not yet exercised against a
> live prod/staging pair** — dry-run against real connections before trusting
> a destructive run.

## Why
Every team running on Supabase eventually needs to **refresh staging
from prod** to test against realistic schema + data. Doing it by hand
is a `pg_dump`/`pg_restore` dance that leaks real user data into a
less-secure environment and is easy to get wrong.

Suparbase already holds multiple connections per user, the Direct
Postgres URL, authoritative catalog access, and a transactional
direct-PG execution path (RLS debugger, SQL playground, session undo).
Sync is the natural composition of those pieces: pick a **base**
(prod — read, *never written*) and a **target** (staging — made to
mirror base), then run it.

Core constraint that defines the feature: **the base is sacred.** It is
opened only inside `READ ONLY` transactions and there is no code path
that hands out a writable base handle.

## Hard requirement
Sync **cannot** run over PostgREST — it needs DDL, `TRUNCATE`,
authoritative `pg_constraint` lookups, and `COPY`. So **both** the base
and target connections must have a Direct Postgres URL configured
(`connections.encrypted_postgres_url`). If either is missing we show the
same "configure direct URL" gate the RLS debugger uses.

Feasible because Suparbase deploys on Coolify (long-lived Node), not a
serverless runtime — a multi-minute sync can run in a route handler
with SSE progress.

## Decisions (locked)
- **Scope:** schema **and** data.
- **Target write strategy:** full-replace per table (`TRUNCATE` then load).
  Target becomes an exact mirror of base for synced tables.
- **Users / PII:** the `auth` schema is always excluded; the target keeps
  its own users. Tables can be marked excluded ("user-scoped"); every
  table downstream of an excluded one must be resolved (see below).
- **Driven by saved sync profiles** (reusable, named configs).
- **Home:** `/c/[id]/sync`, where `[id]` is the **target** connection.
  The profile selects which other connection is the base.

## What ships

### Schema (drizzle migration, next `NNNN_codename.sql`)
- `sync_profile`: id, user_id, name, base_connection_id,
  target_connection_id, options (jsonb), table_config (jsonb:
  per-table include/exclude + dependent resolution), created_at,
  updated_at. Unique `(user_id, name)`.
- `sync_run`: id, user_id, profile_id, base_connection_id,
  target_connection_id, status (`pending` / `running` / `succeeded` /
  `failed` / `partial` / `aborted`), phase, started_at, finished_at,
  stats (jsonb: per-table rows/bytes/durations), error, dry_run.

Both follow the `agent_session` modelling style (status enum, jsonb
stats). Added to `src/server/schema/index.ts`.

### Catalog introspection (`src/server/sync/catalog.ts`)
Reads **`pg_catalog` directly** (not the OpenAPI/comment heuristic in
`schema-introspect`, which is too unreliable for this): tables, columns
(type, nullable, default, identity, generated), PK/FK/unique/check via
`pg_constraint`, indexes, owned sequences, enums, RLS flag, triggers.
All reads happen inside `READ ONLY` transactions on the base.

### Dependency graph (`src/server/sync/graph.ts`)
Builds the FK graph, topologically sorts it (parents-first for inserts,
reverse for truncate), detects cycles, and computes the
**downstream-of-excluded** set used by the user-data resolution step.

### User-data / FK-safety (the core semantic)
1. `auth` schema always excluded — never truncated, never copied.
2. Tables can be marked **excluded (user-scoped)** in the profile — left
   exactly as-is on the target.
3. For every table downstream of an excluded one (e.g.
   `orders.user_id → profiles.id`), the profile must pick a resolution:
   - **skip** the table,
   - **null out** the FK column (only if nullable), or
   - **remap** to a fixed target user id.
   The profile editor surfaces these as a "needs resolution" list and
   blocks a run until each is resolved.

### Schema diff + DDL (`src/server/sync/schema-diff.ts`, `ddl-generate.ts`)
Diffs base vs target catalog and emits ordered DDL. **Additive by
default** (create missing tables / columns / enums / indexes /
constraints). **Destructive** changes (drop table/column, narrowing
type changes) are surfaced in the plan but gated behind an explicit
opt-in. Objects we don't generate (partitioned tables, domains,
extensions, etc.) are **skipped with a visible warning** rather than
silently mishandled.

### Data copy (`src/server/sync/data-copy.ts`)
Per-table `COPY` streaming base→target in topological order, batched so
rows never fully materialise in Node. Applies FK transforms
(null/remap), uses `OVERRIDING SYSTEM VALUE` for identity columns, and
skips generated columns. A per-table **row cap / "sample N rows"**
option keeps runs bounded.

### Sequences (`src/server/sync/sequences.ts`)
`setval()` on owned sequences after load so the target's future inserts
don't collide with copied explicit PKs.

### Runner (`src/server/sync/runner.ts`)
Orchestrates the phases — introspect → schema diff → apply schema →
truncate → data copy → reset sequences — inside **one transaction on the
target** (savepoints per phase). Any failure leaves the target
untouched. Writes progress to `sync_run` and streams SSE to the run
view. Takes a `pg_advisory_lock` on the target so two syncs can't race.

### Safety (`src/server/sync/safety.ts`)
- `readBase()` helper always issues `SET TRANSACTION READ ONLY`; no
  writable base handle exists.
- Refuse if base and target resolve to the same host + database.
- **Dry-run is the default first action**: introspect, diff, plan,
  row-count estimate, write nothing.
- Typed confirmation of the target's name before any non-dry-run
  (full-replace truncates target data).
- Cyclic FKs handled by temporarily dropping/recreating the FK
  (`SET CONSTRAINTS DEFERRED` only when the constraint is deferrable);
  `session_replication_role = replica` is unavailable on Supabase's
  non-superuser `postgres` role, so we don't rely on it.

### UI
- `/c/[id]/sync` — profiles + recent runs for this target.
- Profile editor (`/c/[id]/sync/profiles/[pid]`): pick base connection,
  schema/table checklist with row counts + sizes, mark excluded tables,
  resolve dependents, set options (destructive on/off, row cap).
- Run view (`/c/[id]/sync/runs/[rid]`): live SSE progress, per-table
  status, schema-diff preview, logs. Dry-run shows the full plan.

### API
- `GET/POST/PATCH/DELETE /api/connections/[id]/sync/profiles[/...]`
- `POST /api/connections/[id]/sync/plan` → diff + per-table plan +
  estimates, **no writes**.
- `POST /api/connections/[id]/sync/runs` → start run (profileId,
  dryRun); streams SSE progress, returns runId.
- `GET /api/connections/[id]/sync/runs/[rid]` → status / poll.
- `POST /api/connections/[id]/sync/runs/[rid]/abort`.

## AI-assisted analysis (advisory, opt-in)

The deterministic engine only knows what the catalog declares. An optional
AI pass adds the **judgment** the catalog can't: it infers undeclared
relationships, classifies tables, and suggests exclusions + FK resolutions
that **pre-fill the plan**. It is strictly advisory — it never generates or
runs SQL. The user reviews each suggestion; the deterministic pipeline still
produces the actual DDL/DML, and the dry-run plan is recomputed after the
accepted suggestions are written into `table_config`.

This mirrors the app's existing "AI drafts, user confirms" pattern (spec
014 / SQL playground read-only-by-default).

### What it analyzes (`src/server/sync/ai-advisor.ts`)
Reuses the user's OpenRouter key + model preference from `user_settings`
(same path as `schema-analysis`). One structured call, cached by schema
fingerprint so re-runs are cheap.

The standout value: **inferred relationships.** Supabase apps frequently
ship without declared FK constraints, so `graph.ts` sees nothing to order
on. The advisor reads column names + samples and proposes edges
(`orders.user_id → profiles.id`) which are fed into the *same* topo-sort /
at-risk-FK logic — but tagged **inferred** (vs. catalog-declared) so the
user knows they're heuristics, not constraints.

### Privacy tiers (the core guardrail)
Sending prod rows to an LLM is itself a leak risk — ironic given the goal
is keeping PII *out* of staging. Sampling is therefore tiered, redaction
happens server-side **before** the prompt is built, and the tier is chosen
per analysis:

- **Tier 0 — schema-only (default).** Table/column names, types, declared
  FKs, row-count estimates, and per-column *aggregates*: distinct-count,
  null-fraction, value *shape* (looks-like-email / uuid / timestamp /
  enum). No raw values ever leave the server.
- **Tier 1 — redacted samples (opt-in).** N rows with values masked by
  detected type (`a***@***.com`, names → length only, free text →
  length/shape). Keys/uuids kept structurally where needed for relationship
  inference.
- **Tier 2 — raw samples (gated).** Off by default; explicit per-analysis
  toggle with a warning that real prod data is sent to the model. Strongly
  discouraged.

### Output (zod-validated structured JSON)
- `inferredRelationships[]`: child/ref columns + confidence + rationale.
- `tableClassifications[]`: `user_pii | seed_config | transactional |
  lookup`, a suggested action (sync / exclude / skip), + rationale.
- `fkResolutionSuggestions[]`: per column, `null | remap` (+ remap target)
  + rationale.
- `notes[]`: anything the user should eyeball.

### API + UI
- `POST /api/connections/[id]/sync/analyze` → suggestions for a profile (or
  inline config) at a chosen privacy tier. Rate-limited on the AI bucket.
- Profile editor: an **"Analyze with AI"** button → suggestions panel
  grouped by relationships / classifications / resolutions, each with
  Accept (or Accept all). Accepting writes into `table_config`; the user
  then previews the plan as normal. Inferred edges are visually marked as
  AI-inferred in the table list.

### Guardrails
- Advisory only — no SQL generation, no auto-apply, no auto-run.
- Schema-only by default; raw samples gated behind explicit consent.
- Suggestions are recomputed against the deterministic plan, so an AI
  mistake surfaces as a normal blocking reason / diff, never as a silent
  bad write.

## Phasing (all shipped)
- **Phase 1 — data-only full-replace** (the real prod→staging value):
  gate, catalog introspection, FK graph, profile/run models, COPY
  streaming, exclude-users + dependent resolution, sequence reset,
  dry-run, SSE run view, all safety guards. Schema assumed to match —
  validate and **abort with a clear diff** if columns differ.
- **Phase 2 — additive schema sync**: create missing tables / columns /
  enums / indexes / constraints before copy. Destructive flagged only.
- **Phase 2.5 — AI-assisted analysis (advisory)**: the `ai-advisor` pass,
  schema-only privacy tier, suggestion panel that pre-fills `table_config`,
  inferred-relationship edges fed into the FK graph. Redacted/raw sample
  tiers and inferred-edge ordering land here too.
- **Phase 3 — destructive schema (gated) + polish**: drops/type changes,
  profile-management UX, run history, optional column anonymization,
  scheduled refreshes via the existing cron pattern.

## Out of scope (v3.14)
- **Bi-directional / merge sync.** One direction only: base → target,
  full replace. No upsert mode.
- **Continuous / live replication.** This is a manual (or scheduled in
  Phase 3) point-in-time refresh, not CDC.
- **Storage objects + auth users.** The `storage` and `auth` schemas are
  not synced; GoTrue users stay target-local.
- **Column anonymization.** The chosen PII strategy is exclude-and-keep;
  scrubbing/faking specific columns is a Phase 3 follow-up (the AI table
  classifications from Phase 2.5 feed into it).
- **AI generating or running SQL.** The advisor is suggestion-only; it
  never emits executable DDL/DML and never auto-applies. The deterministic
  engine remains the sole executor.
- **`pg_dump`/`pg_restore` shell-out.** Optional accelerator considered
  but not depended on — version-matched binaries in the container are
  fragile; the in-app catalog generator is the baseline.

## Safety summary
- Base is read-only at the transaction level, always. No writable base
  handle exists in code.
- Self-clobber (base == target) is refused before any work begins.
- Dry-run by default; typed target-name confirmation before a real run.
- The whole run is one transaction on the target: all-or-nothing.
- Sync requires the Direct Postgres URL on both sides; the UI is
  explicit about why.
