# Agent Sentry — security watchdog for vibe-coded Supabase projects (v3.0)

## Why
2026's dominant Supabase failure mode is **RLS drift introduced by AI
coding agents**, and existing tooling is one-shot scanners or weekly
linter emails. Real-world incidents:

- Moltbook (Jan 2026): 1.5M API keys + every user record leaked
  because the AI generated tables without RLS.
- Lovable CVE-2025-48757: 170 of 1,764 scanned production apps had
  inverted "if logged-in → can read all rows" policies.
- Replit Agent (Jul 2025) and Cursor / Claude Opus on PocketOS (Apr
  2026): full prod-DB wipes when an autonomous agent made an
  irreversible call.

Suparbase already has the proxy, the audit log, the encrypted vault,
and the direct Postgres URL. Sentry is the layer that uses all of
them to *actively* probe for these failure modes and flip a kill-
switch before the damage spreads.

v3.0 ships the **security-watchdog half**: probe + findings +
quarantine. v3.1 will add the **AI-seatbelt half**: per-agent session
attribution + one-click session undo.

## What ships in v3.0

### Schema
- `sentry_scan`: one row per scan run (`started_at`, `completed_at`,
  `tables_scanned[]`, `findings_count`, `error`).
- `sentry_finding`: one row per surfaced issue (`kind`, `severity`,
  `status`, `schema_name`, `table_name`, `details jsonb`,
  `first_seen_at`, `last_seen_at`, `resolved_at`,
  `quarantine_policy_name`).

### Probe (`src/server/sentry/probe.ts`)
Two channels per scan:

1. **Anon REST probe** — for every public-schema user table, fires
   `GET /rest/v1/<table>?limit=3` with the stored API key. If the
   response is `200` with rows, the table is anon-readable. Empty
   arrays don't trigger findings (RLS is correctly hiding rows).
2. **`pg_policies` inspection** — when the connection has a direct
   Postgres URL, reads `pg_class.relrowsecurity` + `pg_policy` to
   detect tables with RLS disabled, tables with no policies, and
   policies whose `USING` clause is `true`.

For every anon-readable table, the probe runs a **PII column
heuristic** over `password / secret / api_key / refresh_token /
ssn / credit_card / phone / email / address / dob / passport`. Tables
that match are escalated to `critical`.

### Findings UI
Page at `/c/[id]/sentry`. Hero card counts by severity, with a
"Scan now" button. Findings list groups by status with per-finding
actions:

- **Quarantine** — applies `ALTER TABLE ENABLE RLS` + a
  `CREATE POLICY suparbase_sentry_<id> ... USING (false)` policy so
  anon + authenticated are denied until the owner fixes the
  underlying issue. Reversible via the same UI.
- **Acknowledge** — keeps the finding visible but archived.
- **Resolve** — drops the finding from the open list.

Scan history collapsible at the bottom shows the last 10 scans with
table count + duration + finding count.

### API
- `GET /api/connections/[id]/sentry` → findings + scans + canQuarantine
- `POST /api/connections/[id]/sentry/scan` → run a scan
- `PATCH /api/connections/[id]/sentry/findings/[id]` → ack / resolve
- `POST /api/connections/[id]/sentry/findings/[id]/quarantine` → apply
- `DELETE` on the same path → lift quarantine

Rate-limited on the `checkAiRate` bucket (scans are heavier than a
typical row read).

## Safety
- The probe uses the user's existing stored apikey — it doesn't
  introduce a new credential surface.
- Quarantine policies have a fixed prefix (`suparbase_sentry_`) and
  store their name on the finding row, so they can be dropped
  cleanly. Cleanup happens via the existing executeSql path inside a
  transaction.
- Anon-readable detection ignores 401/403 (correctly denied) and
  empty arrays (RLS is silently filtering), so we don't false-positive
  on tables that are exposed-but-empty for an anon caller.
- The probe captures a `scan_error` finding if `pg_policies`
  inspection fails (e.g. missing direct PG URL). Probe channel keeps
  running.

## What v3.0 deliberately defers
- **Continuous scheduling**. v3.0 ships on-demand "Scan now" only.
  Triggering scans on a cron (Vercel cron / Coolify cron / pg_cron)
  is one route call away and ships in v3.0.x once we pick a
  scheduler primitive.
- **Per-finding deduplication**. Each scan inserts fresh rows for the
  issues it sees. The UI handles this fine because Sentry's findings
  list naturally collapses repeats, but the table can grow. v3.0.x
  will upsert by `(user, conn, kind, schema, table)`.
- **Storage public-bucket probing**. The `public_bucket` kind is in
  the schema but the probe channel for it lands in v3.0.x.
- **Email alerts on critical findings**. The Resend pipe is already
  wired (v2.4.1); a `criticalFindingAlert` template is a 50-line
  follow-up.
- **AI-agent attribution + session undo** — that's the v3.1 half.
