# Workspace power features (v3.20)

## Why

v3.19 closed the acquisition funnel (free tools, guided setup) and the
sync engine. The workspace itself had a set of day-two gaps that every
team hits once a project is in production: nothing stopped a prod
delete from looking exactly like a staging delete, Sentry only ran when
someone remembered to press Scan, schema drift had no history, the only
place to see `pg_stat` numbers was the Supabase dashboard, and every
alert assumed a Slack webhook. This release closes those gaps with
thirteen additions that all reuse existing plumbing (audit log, cron
contract, egress hardening, the read-only SQL path).

## What ships

1. **Environment labels + production guard.** `connections.environment`
   (`production | staging | development | other`, nullable). Owner picks
   it in connection settings or on the create form. Badge in the topbar,
   connection list, and settings. Production requires typing the table
   name in `DeleteRowDialog`, adds a warning line to bulk delete, and
   requires typing `PRODUCTION` to enable SQL write mode.
2. **Agent fingerprints.** 12 new kinds (Windsurf, Codex, Copilot, Gemini
   CLI, Devin, Bolt, Zed, Amp, Kiro, OpenCode, Trae, Junie). `isAiAgent`
   is now "not browser / cli / unknown".
3. **Row history restore.** Any older snapshot with an `afterRow` can be
   written back (PK + generated columns excluded) through the normal
   proxy, so the restore itself is audited and reversible.
4. **Row actions.** "More" menu on every detail preset: Duplicate (opens
   `/new?from=<pk>` prefilled), Copy as JSON, Copy as SQL INSERT, Copy
   link, Copy primary key. Pure `rowToInsertSql` is unit-tested.
5. **Schema tabs.** `/c/[id]/schema/{erd,types,history}`. ERD reuses the
   free tool's renderer (extracted to `ErdDiagram`); types reuse
   `generateTypesFromTables` via a `schemaToParsed` adapter.
6. **Schema snapshots.** `schema_snapshot` table. Auto-captured on every
   introspection when the fingerprint changed (pruned to 50 per
   connection); manual "Snapshot now". Server-side diff endpoint
   (`?from=&to=|live`) built on the pure `diffSnapshots`. A change also
   raises a `schema_changed` notification.
7. **Performance page.** `/c/[id]/performance` reads `pg_stat_*` in one
   read-only transaction (sizes, scans, bloat, indexes, extensions,
   `pg_stat_statements` when readable). Pure advisor (`computeSuggestions`)
   with conservative thresholds; unit-tested.
8. **Scheduled Sentry scans.** `connections.sentry_scan_interval_hours`
   + `sentry_last_auto_scan_at`; `/api/cron/sentry` (Bearer
   `CRON_SECRET`). Owner picks a cadence in settings.
9. **Notes.** `workspace_note` table: team-visible annotations on a table
   (`primary_key` null) or a row. Panel on every detail preset and a
   collapsible strip on table pages. Authors delete their own; owners
   delete any.
10. **Notifications.** `notification` table, one row per recipient.
    Emitted by Sentry criticals, watch alerts, failed reports, failed /
    partial / aborted scheduled syncs, invitations to existing users,
    scheduled-scan failures, and schema changes. Bell with unread badge
    in both headers; polling, mark-read, pruned to 200 per user.
11. **API tokens + public API v1.** `api_token` table (SHA-256 only).
    `/settings/api-tokens` mints (plaintext shown once), lists, revokes.
    `/api/public/v1/{me, connections, connections/:id/{schema, activity,
    sentry/findings, sql}}` — read-only, per-token rate limit, tokens
    carry the owner's access. Documented on `/docs/api`.
12. **Keyboard shortcuts.** `?` cheat sheet, `g` + letter navigation.
13. **Connection import / export.** `/connections/import` parses JSON or
    CSV locally (pure, unit-tested), previews validation, then POSTs each
    row to the existing create endpoint. `GET /api/connections/export`
    returns a secret-free manifest.

## Constitution check

- **I. Performance**: new overlays are `dynamic()`-loaded; the
  performance collector runs one connection with a 15 s statement
  timeout and caps rows; snapshot capture short-circuits on fingerprint.
- **IV. Accessibility**: every new control is a real button / link with
  labels; the shortcut layer ignores inputs and modifier keys; dialogs
  are Radix.
- **V. Vault & proxy**: no new secret reaches the browser. Exports omit
  keys. Tokens are hashed; the public API only reads and every route
  re-checks connection access.
- **VI. Clean code**: server modules under `src/server/**`, pure logic
  under `src/lib/**` with tests, no route-handler business logic.
- **VII. Security**: public API rate-limited per token; cron route uses
  the timing-safe secret check; production guard is defence in depth on
  top of the existing 5 s undo.

## Schema

Migration `0025_flowery_tomorrow_man.sql`: three nullable columns on
`connections`, four new tables (`schema_snapshot`, `workspace_note`,
`notification`, `api_token`), all additive, no downtime.
