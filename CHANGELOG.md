# Changelog

All notable changes between Suparbase versions. Each version corresponds
to a Spec-Kit feature directory under [`specs/`](specs/) and a git tag.

## v3.19.3 · 2026-07-06 · Database sync hardening

Correctness and safety pass over the database sync engine (spec 032),
closing the gaps that stood between "typechecks" and "trust it against a
real prod → staging refresh":

- **Destructive schema DDL is now atomic with the load.** `DROP TABLE` /
  `DROP COLUMN` previously committed in autocommit *before* the data
  transaction, so a failed copy left the target with dropped structure but
  stale data. They now run inside the same transaction and roll back with
  everything else. Additive DDL (create table/column, enums) stays in the
  idempotent pre-copy step.
- **Row caps can no longer silently break foreign keys.** Capping a table
  that is a FK parent of another synced table is now a blocking plan reason
  (the child would reference un-sampled parent rows and fail at COMMIT) with
  a clear message, instead of a cryptic constraint error mid-run. Sampled
  copies are ordered by primary key so "first N rows" is deterministic.
- **Post-copy verification.** Every loaded table is `count(*)`-checked
  against what COPY reported; a mismatch (e.g. a trigger firing during the
  load) is surfaced as a warning and downgrades the run to `partial` rather
  than a green "succeeded".
- **Runs survive a client disconnect.** An interactive run no longer aborts
  its open transaction when the browser tab closes; it finishes and persists
  its result. Per-table progress is written to the `sync_run` row live, so
  the history view and a reconnecting client see real progress.
- **Expandable run history.** Each recent run opens into a per-table detail
  view (rows copied, verified count, duration, warnings, error).
- **Scheduled-run alerts.** A scheduled sync that fails / completes partial /
  aborts now fires the connection's alert webhook (same channel as Sentry).
- **Stronger self-clobber check** (canonical host/port/db, ignoring
  credentials and query params) and a **visible warning for target-only
  indexes** that the diff doesn't reconcile.

## v3.19.2 · 2026-07-06 · Guided first-connection flow

- **Step-by-step guide on `/connections/new`.** A new `ConnectionGuide`
  sits beside the form with five numbered steps (open the dashboard, copy
  the Project URL, copy the anon key, name and create, optional Direct
  Postgres URL), each mapping to a field in the form, plus a direct link to
  the Supabase API settings and an anon-vs-service_role note. Two-column on
  desktop with the form sticky; stacks on mobile.

## v3.19.1 · 2026-07-06 · More generous Free tier

- **Free tier now includes up to 3 Supabase connections** (was 1). A solo
  developer can manage prod, staging, and a side project without paying.
  Unlimited connections and the team workspace remain the paid upgrade.
- Updated everywhere the number is stated: plan catalog, pricing page,
  paywall card, connections onboarding, trial-ending email, and the
  comparison page. The 402 paywall now fires on the 4th connection, and its
  error message pluralizes correctly.

## v3.19.0 · 2026-07-05 · Type generator + tool SEO content

- **New free tool: Postgres to TypeScript Type Generator**
  (`/tools/schema-to-typescript`). Paste Supabase or Postgres DDL and get
  TypeScript interfaces or Zod schemas, with correct nullability (`| null`
  / `.nullable()`), array handling (`text[]` to `string[]`), and sensible
  fallbacks (`jsonb` to `unknown`). Reuses the DDL parser behind the ERD
  visualizer, runs entirely in the browser, and is unit-tested.
- **Parser fix (improves the ERD tool too):** `parseDdl` no longer captures
  trailing modifier keywords into the column type, so it now records `text`
  and `int` instead of `text not` and `int primary`. Multi-word types like
  `double precision` and `timestamp with time zone` are captured whole. The
  ERD diagram's type labels are correct as a result.
- **Detailed SEO content on every tool page:** each of the five tools now
  has a long-form, human-written body (what it does, how to use it, why it
  matters) plus a visible FAQ that also emits FAQPage structured data. New
  shared `ToolContent` component. The `/tools` index gets an overview and
  its own FAQ.
- **Copy pass:** removed every em-dash and en-dash from the tools surface,
  reworded to commas, colons, and parentheses.

The new tool auto-wires into the `/tools` index, the home-page tools
section, the sitemap, and per-page `WebApplication` JSON-LD via the shared
registry, plus a footer link. 205 tests passing (+8), build green.

## v3.18.0 · 2026-07-05 · Free public tools (acquisition hooks)

Four free, no-login tools under `/tools/*` that deliver value in one paste
and convert to sign-up. Three run entirely in the browser; one needs a
stateless server route. Spec: [`specs/033-free-tools/`](specs/033-free-tools/).

- **Supabase Security Scanner** (`/tools/supabase-security-scanner`): paste
  a project URL + optional anon key → the Agent Sentry anon-probe reports
  anon-readable tables, exposed PII, and a 0–100 score.
  `POST /api/tools/security-scan` is **stateless** (never stores URL/key/
  results), IP rate-limited (6 / 10 min), and SSRF-closed by a
  `*.supabase.co` / `*.supabase.in` host allowlist. Reuses the probe logic
  in a DB-free `scanProjectAnon()`.
- **RLS Policy Generator + Explainer** (`/tools/rls-policy-generator`):
  deterministic, in-browser. Pick an access pattern (owner-by-column,
  public/authenticated read, authenticated read-write, admin-claim,
  service-role-only) to get copy-paste SQL, or paste a `CREATE POLICY` to
  get a plain-English explanation.
- **Schema → ERD Visualizer** (`/tools/schema-visualizer`): paste DDL /
  `pg_dump`, get an SVG entity-relationship diagram with FK edges. Parses
  in-browser; download the SVG.
- **Secret & Key Leak Scanner** (`/tools/secret-scanner`): paste code /
  `.env` / logs → flags leaked secrets with severity and fix advice,
  decoding JWTs to tell a critical `service_role` key from a public `anon`
  key. Entirely in-browser.

Wiring: `/tools` index, a "Free tools" section on the home page, header +
footer nav, sitemap + per-page `WebApplication` JSON-LD. `/api/tools/*` is
CSRF-exempt (unauthenticated + stateless, so CSRF is moot) which also keeps
the tools working regardless of `AUTH_URL` vs visited-host config.

Pure libs (`src/lib/tools/*`) are unit-tested (+19 tests, 197 total). No new
dependencies; no persistence of anything scanned.

## v3.17.0 · 2026-07-04 · Six workspace features

Six client-facing additions, each reusing existing plumbing (cron,
webhook, email, the read-only SQL path) so they land native rather than
bolted-on. Verified end-to-end against a running instance.

- **Command palette upgrade** (`Cmd/Ctrl-K`): a full "Go to" list covering
  every workspace destination (including the new tabs), plus **Pinned
  tables**, **Recently viewed**, and **Run a snippet** groups. Selecting a
  snippet opens the SQL playground with it preloaded.
- **Pinned tables + recent records**: pin any table (button on the table
  view) to float it in the palette; recently-viewed rows are recorded on
  the row detail page and surfaced in the palette. New `pinned_table` +
  `recent_record` tables, per-user, MRU-capped.
- **Column insights**: a stats popover on every column in the Schema
  browser — total / null% / distinct / min / max plus a top-values
  distribution bar. Read-only aggregate queries via
  `POST /api/v/[id]/column-stats`.
- **Activity feed** (`/c/[id]/activity`): a connection-level timeline from
  `audit_log`, newest first, filterable by verb, keyset-paginated, with the
  agent-session label joined in so each write is attributable. Rows deep-link
  to the record.
- **Scheduled reports** (`/c/[id]/reports`): run a saved snippet on an
  interval and deliver the result by email (HTML table via Resend) or
  webhook (JSON POST). New `scheduled_report` table + `/api/cron/reports`
  (Bearer `CRON_SECRET`).
- **Data watches** (`/c/[id]/watches`): evaluate a SELECT on an interval and
  alert a webhook when the match count **grows** (debounced, so a
  persistently-true condition stays quiet). New `data_watch` table +
  `/api/cron/watches`. SSRF-validated at save and fire time; falls back to
  the connection's Sentry alert webhook.

**Bug fix (pre-existing):** the SQL playground's `executeSql` set the
statement timeout with a postgres.js tagged template, which parameterizes
it — but Postgres `SET` rejects bind params (`syntax error at or near
"$1"`), so **every** playground query was failing. Now interpolates the
clamped-integer timeout via `unsafe()`, matching the sync engine. This
repairs the playground and unblocks the new SQL-backed features.

Schema: 0022 adds `scheduled_report`, `data_watch`, `pinned_table`,
`recent_record` (all additive, no downtime). Two new cron routes to wire
into your scheduler (see PRODUCTION.md).

## v3.16.0 · 2026-07-03 · Onboarding funnel + workspace quality features

Five additions focused on the new-user journey and day-two operations.
All verified end-to-end in a running instance (signup → checklist →
settings → SQL → scan).

- **Getting-started checklist** (`/connections`): after the first
  connection is added, a live 4-step checklist tracks real account state
  — connection saved, Direct Postgres URL added, first Sentry scan run,
  AI configured (optional) — with deep links into each surface. It
  auto-hides once the core steps are done and is dismissible any time
  (`user_settings.onboarding_dismissed_at`). Completes the signup funnel:
  welcome page (0 connections) → checklist (1+) → done.
- **Saved SQL snippets** (`/c/[id]/sql`): name and save queries per
  connection (new `sql_snippet` table, synced across devices, upsert by
  name, 100 per connection). Load or delete from the new Snippets panel
  next to Recent.
- **Connection health card** (`/c/[id]/settings`): on-demand probe of
  PostgREST reachability with the stored key, Direct Postgres
  connectivity + latency, and Sentry scan staleness / open criticals.
  `GET /api/connections/[id]/health`, error strings redacted.
- **Sentry alert webhook** (`/c/[id]/settings`, owner-only): a
  Slack/Discord-compatible webhook pinged when a scan surfaces NEW
  critical findings (re-scans of known issues stay quiet — powered by the
  v3.15 findings de-dupe). SSRF-validated at save time AND fire time;
  fire-and-forget so a dead webhook never fails a scan. New
  `connections.alert_webhook_url` column.
- **Audit log CSV export** (`/c/[id]/settings`):
  `GET /api/v/[id]/audit/export` streams the most recent 10k audit
  entries (with before/after row values) as RFC-4180 CSV, batched
  server-side; bulk-rate-limited.

Schema: 0021 adds `sql_snippet`, `connections.alert_webhook_url`,
`user_settings.onboarding_dismissed_at` (all additive, no downtime).

## v3.15.0 · 2026-07-03 · Production hardening (audit follow-up)

Closes the remaining deferred caveats from PRODUCTION.md plus the gaps a
fresh three-way audit (security / sync engine / operations) found in the
post-v3.13 surface. No new features.

**Security:**

- **Password change / reset now revokes every session.** New
  `users.password_changed_at` column (migration 0020); the NextAuth `jwt`
  callback rejects tokens issued before it (60s-cached lookup, fail-open
  on DB hiccups). A stolen session cookie dies the moment the owner
  rotates their password, instead of riding out the JWT lifetime.
- **Timing-safe cron auth.** `/api/cron/retention` and `/api/cron/sync`
  now compare `Authorization` against `CRON_SECRET` with
  `crypto.timingSafeEqual` over SHA-256 digests
  (`src/server/security/cron-auth.ts`) instead of `!==`.
- **Connection-string redaction.** `redact()` recognises
  `postgres://`/`mysql://`/`mongodb://`/`redis://`/`amqp://` URLs
  (`[REDACTED_DB_URL]`); sync run errors are redacted before being stored
  on the run row or streamed to the browser, so a driver error can never
  leak a database URL.

**Sync engine correctness:**

- **COPY failures propagate.** A COPY-FROM command that fails after the
  stream drains was silently swallowed; over an aborted transaction the
  final COMMIT silently becomes ROLLBACK and the run could report
  "succeeded" with nothing written. The error now propagates and the run
  fails loudly with the real cause.
- **Anonymization rules block when their column is missing.** A rule
  pointing at a column that no longer exists on the base used to be
  silently skipped — a renamed PII column would sync raw. It now blocks
  the plan until the rule is fixed.
- **Row-cap visibility.** The plan warns which tables a `rowCap` will
  truncate, so a forgotten test cap can't masquerade as a full sync.
- **Scheduled-sync overlap guard.** The cron route skips a profile while
  a non-dry run against the same target is still `running` (with a 2h
  staleness cutoff so a crashed run can't wedge the schedule).

**Operational (closes PRODUCTION.md §3 caveats):**

- **Sentry findings de-dupe.** Repeat scans refresh `last_seen_at` /
  severity / details on the existing non-resolved finding for the same
  (kind, schema, table, column) instead of inserting a duplicate row per
  scan. Resolved findings that re-appear become new findings.
- **`attachToSession()` race fixed.** The cold path (first write of a
  burst) is serialized with a per-(user, conn, kind) transaction-scoped
  advisory lock, so concurrent first-writes can no longer split one burst
  into two agent sessions.

Schema: 0020 adds `users.password_changed_at` (additive, no downtime).

## v3.14.1 · 2026-05-24 · Database sync hardening

Correctness follow-up to v3.14.0, before the feature is trusted on a live
prod/staging pair.

- **Unit tests** for the pure sync logic (`tests/sync-*.test.ts`): FK
  topo-sort / cycle detection / at-risk-FK analysis, the schema diff
  (create/add/drop, type-change + extra-NOT-NULL blockers, enum values),
  plan blocking + FK-resolution transforms + anonymization validation, and
  identifier/literal quoting (the injection-sensitive surface).
- **Trigger detection.** The catalog now reads user triggers; synced tables
  that have them are flagged in the plan — they fire during `COPY` because
  Supabase's non-superuser role can't `SET session_replication_role`.
- **Cooperative abort.** A running sync can be cancelled
  (`POST …/sync/runs/[rid]/abort` + an Abort button); the runner checks
  between tables and rolls back the data transaction, leaving the target
  untouched.
- **Stronger self-clobber guard.** Beyond the URL check, the runner now
  compares the live cluster `system_identifier` + `current_database()` so
  base==target is caught even via different endpoints (pooler vs. direct).
- **Atomicity note** in the UI: schema DDL runs outside the data transaction
  (not rolled back on a later failure; idempotent on re-run).

## v3.14.0 · 2026-05-24 · Database sync (base → target)

One-directional sync to refresh a target (e.g. staging) from a base
(e.g. prod) without leaking real user data. The **base is sacred** —
opened only in a forced-read-only session (`default_transaction_read_only`),
with no writable base handle anywhere in the code. Direct-Postgres-only:
both connections need a Direct Postgres URL. Spec:
[`specs/032-db-sync/`](specs/032-db-sync/).

**Engine (`src/server/sync/`):**

Authoritative `pg_catalog` introspection (`catalog.ts`) — columns,
identity/generated, PK/FK/unique/check via `pg_constraint`, indexes,
sequences, enums. FK dependency graph (`graph.ts`) gives parents-first
copy order, cycle detection, and "downstream-of-excluded" risk analysis.
`runner.ts` runs the whole data load in **one target transaction**
(all-or-nothing) with `COPY`-streamed full-replace per table
(`data-copy.ts`), sequence reset (`sequences.ts`), and safety guards
(`safety.ts`: read-only base, self-clobber refusal, advisory lock,
typed-name confirmation).

**User/PII handling:** `auth` schema always excluded; tables can be
marked exclude (keep target's own users) or skip; any synced FK pointing
at an excluded/unsynced table must be resolved (null-out or remap).

**Schema sync:** when enabled, a catalog diff (`schema-diff.ts` +
`ddl-generate.ts`) creates missing enums/tables/columns/constraints/
indexes before the load; destructive drops are gated behind an explicit
toggle.

**AI advisor (opt-in):** infers undeclared relationships, classifies
tables (PII/seed/transactional), and suggests FK resolutions that
pre-fill the config. Privacy-tiered (schema-only default → value-shapes
→ raw, redacted server-side); advisory only, never emits SQL.

**Anonymization:** per-column masks (null / hash / email / fixed) applied
in the base SELECT projection during copy.

**Scheduling:** `/api/cron/sync` runs due profiles unattended on an
interval (Bearer `CRON_SECRET`).

**UI:** `/c/[id]/sync` — saved profiles, dry-run plan preview with table
rules + FK/anon editors, live SSE run progress, and run history.
Migrations `0018` / `0019`.

## v3.13.0 · 2026-05-18 · Production hardening (important + nice-to-have)

Follow-up to v3.12.0. Closes every Important and Nice-to-have item
from the production-readiness audit. No new features; this is the
"don't make a mistake under load" release.

**Dunning UX (Past-due banner):**

`ActivePlan` gains an `isPastDue` flag derived from
`status IN ("on_hold", "failed")`. The auth layout
(`src/app/(auth)/layout.tsx`) resolves the active plan once per
request and hoists a `PastDueBanner` above every signed-in page if
the subscription is dunning. The banner explains the situation in
plain English and links straight to `/settings/billing` so the
user can launch Dodo's customer portal. Soft-fails on a DB error
(banner just doesn't render; never locks anyone out).

**CSP hardening (drop `'unsafe-inline'` from script-src):**

`src/middleware.ts` now generates a fresh nonce per request, sets
`x-nonce` on the request headers (so Next.js' own hydration scripts
pick it up), and emits a Content-Security-Policy header with
`script-src 'self' 'nonce-<x>' 'strict-dynamic'` in production.
Dev mode keeps `unsafe-inline 'unsafe-eval'` because HMR needs
them. Style-src still allows `'unsafe-inline'` (Radix primitives
inject runtime positioning styles and a couple of our components
ship inline animation stylesheets; XSS via CSS is materially less
dangerous than via JS). Also adds an explicit
`X-Frame-Options: DENY` for defense-in-depth alongside the existing
`frame-ancestors 'none'`. The duplicate CSP in `next.config.ts`
was removed - middleware now owns all security headers.

**Resend bounce + complaint handling:**

New `POST /api/webhooks/resend` route. Reuses the existing
Standard Webhooks verifier (same crypto Dodo uses; Resend uses
Svix headers but the signing format is identical). Listens for:

- `email.bounced`: hard bounces (transient bounces are no-op'd)
  set `users.email_undeliverable_at` + reason on the row via
  `suppressEmail()`.
- `email.complained`: spam complaints, same suppression.
- Anything else: 200 OK, no-op.

`sendEmail()` consults the suppression list before every send and
returns `reason: "suppressed"` if the recipient is flagged. The
operator can clear the flag manually via `unsuppressEmail(userId)`
or directly in SQL. Schema migration `0017_*.sql` adds the two
columns (`email_undeliverable_at`, `email_undeliverable_reason`).

To activate, set `RESEND_WEBHOOK_SECRET` to the value Resend gives
you when creating the webhook. Without it the endpoint returns 503
so Resend retries instead of trusting unsigned events.

**`List-Unsubscribe` headers on every transactional email:**

`sendEmail()` now sets `List-Unsubscribe: <mailto:...>` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` on every send.
Gmail / Yahoo / Outlook reward senders who honour RFC 8058 with
better deliverability and surface a standardised Unsubscribe button
in their UI. The mailto routes to `EMAIL_UNSUBSCRIBE_TO` (env), or
`EMAIL_REPLY_TO`, or `contact@suparbase.com` - whichever is set.

**Redact-pattern hardening:**

`src/lib/redact.ts` gains patterns for: Resend keys (`re_*`),
Standard Webhooks signing secrets (`whsec_*`), GitHub tokens
(`ghp_/gho_/ghu_/ghs_/ghr_`), 32-byte base64 keys (catches
`SUPARBASE_ENCRYPTION_KEY` shape), and 64-char hex (HMAC secrets).
Token-type markers distinguish `[REDACTED_KEY]` / `[REDACTED_SECRET]`
/ `[REDACTED_TOKEN]` / `[REDACTED_HASH]` so an operator browsing
logs can tell which class of secret leaked.

11 new unit tests in `tests/redact.test.ts` lock in the behaviour.

**Backup runbook (README):**

Added a real backup section to the Coolify deploy guide. Documents
both Coolify's automated snapshots AND an off-host `pg_dump`-based
script for resilience to host loss. Includes the verify-restore
drill (3 commands) and what's intentionally NOT backed up
(customer Supabase data, the vault key).

**Patch-version dependency bump:**

- `date-fns` 4.1.0 → 4.2.1
- `posthog-js` 1.373.5 → 1.374.0
- `react-hook-form` 7.75.0 → 7.76.0
- `next` to latest 15.x

Skipped major bumps that need migration (Next 16, Zod 4, Tailwind 4,
TypeScript 6, lucide-react 1, drizzle major). Those go in a
dedicated upgrade ship.

**E2E test for guest checkout:**

`e2e/guest-checkout.spec.ts` covers: form renders, plan redirects
(`/checkout/free` → `/signup`, `/checkout/team` → `/contact`),
welcome-token error path, and the billing-not-configured fallback.
Doesn't drive Dodo's hosted checkout - that needs sandbox creds -
but catches every Suparbase-side surface in the flow.

**Schema:** migration 0017 (additive, no downtime).

Typecheck clean, 143 tests passing (+11 from redact tests), build
green.

## v3.12.0 · 2026-05-18 · Production hardening (critical gaps)

Closes the four CRITICAL gaps flagged in the v3.11.x production-
readiness audit. No new features; everything here is about
preventing the kind of mistake that only shows up in incident
post-mortems.

**1. Rate-limit on `/api/account/claim-welcome`:**

The guest-checkout welcome flow consumes a single-use token to set
a password and sign in. Without a rate limit, a leaked token could
be brute-forced. Now reuses the signup IP bucket
(`checkSignupRate`, 5/hour/IP). Generous enough that a legit user
who mistypes never trips it, slow enough that token enumeration is
impractical.

**2. Retention cron now sweeps abandoned guest users + expired
   verification tokens:**

`src/server/audit/retention.ts` gains two new passes:
- `expiredTokensPruned`: deletes any `verificationTokens` row past
  expiry (email-verify, password-reset, welcome:* all covered).
  Previously cleaned only on access.
- `abandonedUsersPruned`: deletes users with no password hash, no
  verified email, no subscription history, created > 14 days ago.
  This is the orphan trail of guest-checkout sessions where the
  visitor closed the tab, and half-finished signups that never
  verified. The 14-day window is conservative; rows with ANY
  subscription history (active, cancelled, expired) stay.

Both run inside the existing `runRetention()` so they're driven by
the same cron secret + cadence. `DEFAULT_RETENTION` gains
`abandonedUserRetentionDays: 14`.

**3. Three missing Dodo events wired:**

`payment.failed`, `payment.refunded`, `subscription.trial_ending`
were previously recorded as billing events but never affected the
user or sent an email - they just sat in the table.

Added `mapDodoEventToNotification(eventType)` in
`src/server/billing/dodo-events.ts` that returns the right
`BillingNotificationKind` for each. The webhook handler
(`src/app/api/webhooks/dodo/route.ts`) now dispatches a themed
email via the new `billing-notification` template before marking
the event applied:

- `payment_failed`: "We couldn't charge your card. Update payment
  method." Links to `/settings/billing`.
- `payment_refunded`: "Your refund has been processed. Funds in
  5-10 business days."
- `trial_ending`: "Your trial ends on <date>. Add a card to keep
  your subscription."

Email is best-effort: a Resend outage doesn't fail the webhook (we
mark applied and log a warning so Dodo doesn't retry forever).
Subscription state mutations (`subscription.on_hold`, etc.) are
unchanged and still owned by `mapDodoEventToUpdate`.

**4. Soft-delete account flow (matches privacy/terms promise):**

The terms and privacy pages already promised "soft-delete at
cancellation, hard-delete 30 days later." The code was doing an
immediate hard-delete. This release fixes that drift.

- **Schema** (`drizzle/0016_*.sql`): adds
  `users.deletion_scheduled_at timestamp with time zone null`.
  Additive, no downtime.
- **`src/server/auth/delete-account.ts`** rewritten:
  - `scheduleAccountDeletion(userId, days=30)` - sets the
    timestamp. Replaces the old hard-delete entry point.
  - `cancelScheduledDeletion(userId)` - clears it.
  - `executeScheduledDeletions()` - the cron-callable hard-delete
    pass. Wired into `/api/cron/retention`.
  - `getDeletionStatus(userId)` - read helper for the UI.
- **`src/server/auth/credentials.ts`** refuses sign-in when the
  grace period has elapsed (account is queued for deletion on the
  next cron tick; we don't want a session re-creating state for a
  row about to disappear). Within the grace window, sign-in still
  works so the user can cancel.
- **`AccountSettingsPanel`** gains:
  - A `DeletionPendingBanner` showing the deadline + a Cancel
    button while the grace period is active.
  - "Deletion already scheduled" disabled state on the delete
    button when one is pending.
  - Updated confirm-dialog copy: "Schedule deletion?" (was
    "Delete account?").
- **`deleteMyAccount` server action** now schedules instead of
  hard-deleting. User is signed out immediately, lands on
  `/?deletion=scheduled`.
- **`cancelMyDeletion` server action** added for the in-grace
  reverse action.

**Operational notes:**

- The retention cron is the ONLY hard-deleter; nothing else mutates
  the row after `deletion_scheduled_at` is set.
- Cascade behaviour on hard-delete is unchanged: connections,
  subscriptions, agent sessions, etc. cascade away; audit_log keeps
  anonymised rows via set-null FK.
- Customers on a paid plan still need to cancel their Dodo
  subscription separately - we don't auto-cancel because we don't
  want to leave them with an unintended billing relationship if
  they reverse the deletion.

Typecheck clean, 132 tests passing, build green. Schema migration
0016 generated and ready to apply.

## v3.11.0 · 2026-05-17 · Guest checkout

Pay first, set a password after. The Hosted plan CTA on /pricing
now skips the signup-first dance: enter your email, complete Dodo's
hosted checkout, land on a welcome page where you pick a password
and we sign you in. The subscription is already attached.

**New surfaces:**

- `/checkout/[plan]/page.tsx` - public checkout page. Email +
  optional display name, monthly / annual cadence toggle (when the
  operator has published an annual Dodo product), pricing pulled
  from `PLAN_LIMITS`. If the visitor is already signed in we
  redirect them to `/settings/billing` instead.
- `src/components/checkout/GuestCheckoutForm.tsx` - client form.
  Submits to the new API and hands the visitor off to Dodo's
  hosted checkout on success. Honours the `cancelled=1` query
  parameter when Dodo redirects back after a back-button.
- `POST /api/billing/guest-checkout/route.ts` - public API. Zod
  validates, IP rate-limited via the signup bucket, looks up or
  creates the user row, mints a single-use `welcome:` token, fires
  the welcome email best-effort, then creates the Dodo checkout
  with `metadata: { user_id, cadence, signup_path: "guest_checkout" }`
  and `return_url=/api/billing/return?status=success&welcome=<token>`.
- `/welcome/[token]/page.tsx` + `WelcomeClaimForm.tsx` - lands the
  visitor after Dodo's success redirect. Picks a password (12+
  chars), POSTs to `/api/account/claim-welcome`, then immediately
  calls `signIn("credentials")` and routes to `/connections`.
- `POST /api/account/claim-welcome/route.ts` - consumes the
  welcome token (single-use, 7-day TTL, single transaction with
  `email_verified` stamp), bcrypts the password, persists.
- `src/server/auth/welcome-token.ts` - issue / peek / consume.
  Reuses NextAuth's `verificationTokens` table with the
  `welcome:<userId>` namespace so it can't collide with the
  email-verify or password-reset flows.
- `src/server/email/templates/welcome-payment.ts` - themed email
  matching the other transactional templates. Sent at checkout
  start so the visitor has a fallback claim path if they close
  the tab before Dodo's redirect.
- `src/app/api/billing/return/route.ts` - forwards the `welcome`
  query parameter into `/welcome/<token>` on success, drops the
  visitor back on `/checkout/hosted?cancelled=1` on cancel.

**Pricing-page change:**

- The Hosted plan CTA now says "Start free trial" and routes to
  `/checkout/hosted` instead of `/signup`. Free and Team CTAs
  unchanged (Free has no payment; Team is sales-led).

**Edge cases covered:**

- Email already has an active subscription -> 409 with a friendly
  redirect to `/signin?email=`.
- Email exists but no password (OAuth-only or prior abandoned
  guest checkout) -> reuse the row, new welcome token issued.
- Welcome token expired (>7 days) -> page renders an explainer
  and points the visitor at `/forgot` (which works regardless of
  password state).
- Welcome token already claimed -> page shows "you already
  claimed this account" with a Sign-in link.
- Dodo not configured on this deployment -> form replaced with a
  setup banner pointing at `/contact?topic=sales`.
- Webhook continues to work unchanged: `metadata.user_id` lets the
  subscription attach to the user row regardless of which checkout
  path created it.

**Signup error reword:**

- The "email already exists" error now says: "An account with this
  email already exists. Sign in, or use forgot-password if you
  haven't set one yet." This handles the guest-checkout user who
  later tries to sign up via the normal path.

No schema changes (the welcome flow reuses the existing
`verificationTokens` table). No new dependencies.

## v3.10.0 · 2026-05-17 · Contact form + accessibility blocker fixes

Two themes in one release: a proper contact form replaces the
scattered `mailto:contact@suparbase.com` links across the site,
and six WCAG 2.2 AA criteria flip from "Partially Supports" to
"Supports" in our VPAT - the ones we'd been documenting that
turned out to be cheap to actually fix.

**New `/contact` page:**

- `src/app/contact/page.tsx` - public form page with topic-aware
  side cards (general, sales, support, security disclosures,
  privacy). Honours `?topic=sales|security|support|press` so
  links from `/pricing` and the legal pages preselect the right
  routing.
- `src/components/contact/ContactForm.tsx` - client form with
  topic select, message character counter, honeypot field
  (`name="website"` hidden off-screen + `tabIndex={-1}`),
  `aria-busy` on the submit button, `role="status"` /
  `role="alert"` for the result and error banners.
- `src/app/api/contact/route.ts` - POST endpoint. Zod-validated,
  per-IP rate-limited (5/hour via `checkContactRate`), honeypot
  enforced server-side, returns `200 { ok: true, delivered }`
  even when email isn't configured so the form still works in dev
  or unconfigured deployments.
- `src/server/email/templates/contact-submission.ts` - themed
  email sent TO `CONTACT_INBOX` (default `contact@suparbase.com`)
  with `Reply-To: <visitor>` so the operator's "Reply" lands in
  the visitor's inbox.
- `src/lib/contact/topics.ts` - shared topic taxonomy so the
  client, API route, and email template can't drift.
- `src/server/proxy/ratelimit.ts` - added `checkContactRate`
  bucket (5 submissions/hour/IP).

**Mailto swaps (every page that had a contact email now points at
the form instead):**

- `PublicFooter` (×3), `about`, `docs`, `docs/api` (×2),
  `pricing` (Team plan → `?topic=sales`), `privacy` (×2),
  `terms` (×3), `accessibility`,
- `AccountSettingsPanel`, `BillingPanel` (×2), `TwoFactorPanel`,
- `lib/use-cases/content/healthcare-saas.tsx` (CTA + footer).
- Intentional fallbacks kept: `global-error.tsx` (fires when the
  app itself is broken - form might also be) and
  `ForgotPasswordForm.tsx` (only renders when email isn't
  configured at all).

**Accessibility blocker fixes - six VPAT rows flip to "Supports":**

- **1.4.3 Contrast (Minimum)**: `--fg-faint` darkened in
  `globals.css`: dark mode `110 110 105` → `144 144 138`
  (4.6:1 vs old 3.9:1); light mode `130 130 134` → `102 102 107`
  (4.7:1 vs old 3.55:1). Both themes clear 4.5:1.
- **2.5.8 Target Size (Minimum)**: every secondary icon button
  bumped from `p-1` (~22px) to `p-1.5` (~26px), clearing the
  24×24 CSS-pixel minimum. Files: `EditableField` (Save / Cancel),
  `ResetPasswordForm`, `SchemaView`, `ChatConversationSidebar`,
  `TablesList`, `AiChat`, `TableListView`, `DashboardWidgets`,
  `AuthUsers`, `UsersAdmin`.
- **1.3.1 / 2.4.6**: `scope="col"` on every comparison /
  pricing table header (`/compare/[slug]`, `/admin/billing`,
  `/agent-sentry`).
- **3.2.6 Consistent Help**: fixed by the contact form itself.
  One destination linked from the same footer position on every
  page, with `?topic=` preserved.
- **4.1.3 Status Messages**: `aria-busy` on the Topbar refresh
  button + on the contact-form submit. Inline-edit and account
  form spinners were already covered; this closes the loop.

**Statement + VPAT updates:**

- `src/app/accessibility/page.tsx` - "Where we're still partial"
  trimmed to two genuine items (1.4.11 hairline borders,
  automated-tool verification). Conformance line bumped from
  "Partially conformant" to "Substantially conformant".
- `src/app/accessibility/vpat/page.tsx` - `REPORT_DATE` →
  2026-05-17, `PRODUCT_VERSION` → v3.10.0, `VENDOR_CONTACT` →
  `/contact`. New revision-history entry summarising the six
  flips. Six criterion rows updated: 1.3.1, 1.4.3, 2.5.8, 3.2.6,
  4.1.3, 302.2.

No schema changes. No new dependencies.

## v3.9.1 · 2026-05-17 · Drop the footer Signal panel

Removed the right-hand "Signal" aside from `PublicFooter` - it added
clutter without proportional value (release version + blog title
+ shipped count are all already reachable from the structured nav
columns directly below). The manifesto block is now a single
left-aligned headline + paragraph + CTA pair.

- `SignalPanel` and `SignalRow` components deleted.
- `LATEST_RELEASE_DATE` / `FEATURES_SHIPPED` constants gone.
- Unused `listArticles` + `cn` imports cleaned up.
- Manifesto block layout switched from
  `grid md:grid-cols-[1fr_minmax(0,18rem)]` to a single column.

Cosmetic only. Typecheck clean, 132 tests passing, build green.

## v3.9.0 · 2026-05-15 · Email verification + API docs + agent fingerprints

Four shippable items from the "if you ask" backlog. No new schema
the email verification flow reuses NextAuth's existing
`verificationTokens` table with a namespaced identifier so a future
magic-link rollout won't collide.

**Email verification:**
- `src/server/auth/email-verification.ts` issues SHA-256-hashed
  tokens with a 24h TTL; previous in-flight tokens are cleared on
  each new issue. Confirmation marks `users.email_verified` and
  invalidates every outstanding token for the identifier.
- `src/server/email/templates/email-verification.ts` - themed email
  matching the invitation + reset templates.
- `POST /api/account/verify-email/start` - re-send for the
  signed-in user, or accept `{ email }` from anonymous callers
  (enumeration-resistant). Per-(ip + email) rate-limited.
- `POST /api/account/verify-email/confirm` - token consumption.
  200 / 410 (expired) / 409 (already verified) / 404 (unknown).
- `/verify-email/[token]` - server-rendered landing page. Confirms
  on first GET; no client JS required, no token in client state.
- Signup flow now fires the verification email automatically after
  the user row commits. Fire-and-forget - delivery failure can't
  roll signup back.
- `/settings/account` gains an inline verification banner: amber
  with a Resend button when not verified, green confirmation when
  verified.

**Agent-kind fingerprints (Aider, Cline, Continue.dev):**
- `AgentKind` union extended with `aider`, `cline`, `continue_dev`.
- Regex patterns in `src/server/sentry/fingerprint.ts`:
  - `aider` matches `aider/<version>` UA.
  - `cline` matches both `cline/…` and the legacy `claude-dev/…`
    (the IDE plugin rebranded mid-2025).
  - `continue_dev` matches `continue-dev/…` and bare `continue/…`.
- `isAiAgent()` flags all three as AI.
- 3 new fingerprint tests pin the patterns.

**Public API documentation:**
- `/docs/api` lists every stable REST endpoint a customer or
  operator can script against - auth notes, CSRF policy, full
  request/response shapes for account, billing, operational
  endpoints. Explicit "NOT public yet" section names the routes
  whose shape may change without notice.
- Linked from `/docs` header as "API reference →".

**Annual billing wiring:**
- `DodoConfig.hostedAnnualProductId` reads `DODO_HOSTED_ANNUAL_PRODUCT_ID`
  from env. `.env.example` documents it.
- `POST /api/billing/checkout` now honours `cadence: "annual" | "monthly"`
  (via query param or JSON body) and routes to the annual product id
  when configured. Falls back to monthly when the env var is unset.
- BillingPanel's existing Monthly/Annual toggle now actually
  affects which product the checkout creates - passing
  `cadence` to the API + tracking it as a property on the
  `checkout_started` analytics event.

132 tests passing (3 new). Typecheck clean, build green. No
migration required.

## v3.8.1 · 2026-05-15 · Production-readiness completeness pass

Six items that were honestly still on my plate after the v3.8.0
batch. All real code work - no marketing, no scaffolding.

**GDPR data export (closes a stale terms-of-service claim):**
- New `src/server/auth/data-export.ts` assembles the user's full
  record: account, subscription, settings, owned connections,
  memberships, saved views, dashboards, custom actions, agent
  sessions, and up to 100k audit log rows.
- Encrypted columns (Supabase keys, Postgres URL, TOTP secret)
  are **excluded** from the export - they wouldn't be useful
  outside this deployment, and including the encrypted blobs
  would be a forensic foot-gun.
- `GET /api/account/export` returns the JSON with a
  `Content-Disposition: attachment` header.
- "Download my data (JSON)" button on `/settings/account` (GDPR
  Art. 15 / Art. 20). Closes the false claim in the Terms page
  that the export "is exportable as JSON from your account page".

**Password change for signed-in users:**
- `POST /api/account/change-password` requires the current password
  + a new password ≥12 chars. Rate-limited per (ip + userId) so a
  leaked session can't grind brute-force. 409 for OAuth-only users.
- Inline `ChangePasswordForm` on `/settings/account` (current + new
  + confirm with mismatch validation).

**Dodo customer-portal link:**
- New `createPortalSession()` on the Dodo client calls
  `POST /customers/{id}/portal-session` and returns the hosted
  portal URL.
- `POST /api/billing/portal` mints a fresh session URL for the
  signed-in user. 404 when no customer id yet (free-tier never
  started a checkout); 502 with a "check receipt email" message
  if Dodo's sandbox doesn't have the portal enabled.
- "Manage subscription" button on `/settings/billing` Current Plan
  card, visible only when `active.isPaid`.

**Unit tests for v3.6+ code:**
- `tests/totp.test.ts` (9 specs) - MFA cookie sign/verify cycle:
  same-user accept, different-user reject, tampered-signature
  reject, expired reject, malformed reject, secret-rotation
  invalidation, constant-time compare. Plus library-compat sanity
  for otpauth (RFC test-vector generates + validates, wrong code
  rejects).
- `tests/password-reset.test.ts` (4 specs) - `hashToken()` is the
  load-bearing primitive for the "we never store plaintext tokens"
  guarantee. Tests pin the SHA-256 contract, determinism, and the
  "no input normalisation" rule.

**Cleanup:**
- `src/server/security/client-ip.ts` extracts the `clientIp(req)`
  helper that was duplicated in `forgot-password`, `reset-password`,
  and `2fa/verify`.
- `next-auth.d.ts`-style module augmentation in `src/server/auth.ts`
  declares `User.totpEnabled` and `JWT.id` + `JWT.requires2FA`. Drops
  the `as { ... }` casts that were sprinkled in the jwt + session
  callbacks.

**Operator docs:**
- `PRODUCTION.md` gains a "v3.6-v3.8 account + observability smoke
  (15 min)" section. Walks: forgot-password, password change,
  account deletion, data export, 2FA round-trip (enable, sign in,
  recovery code, disable), `/api/health` shape, `/status` rendering,
  admin parity. Plus the known limitations (API routes not gated
  by 2FA, password change doesn't terminate other sessions, data
  export 100k cap, portal 502 fallback).

129 tests passing (4 new). Typecheck clean, production build green.
No schema changes.

## v3.8.0 · 2026-05-15 · 2FA + status + roadmap + annual billing scaffolding

The dedicated 2FA ship plus a bunch of customer-facing pages and
backend scaffolding queued from the production-readiness review.

**Two-factor authentication (TOTP + recovery codes + enforcement):**
- New `otpauth` + `qrcode` deps; new module
  `src/server/auth/totp.ts` with secret generation, code
  verification (RFC 6238, ±1 window), recovery-code generation +
  redemption, and a signed `suparbase-mfa-ok` cookie (HMAC-SHA256
  via AUTH_SECRET, 24h TTL).
- Schema: `users.totp_secret_encrypted` (AES-256-GCM via vault),
  `users.totp_enabled_at`, plus new `user_recovery_code` table
  with `(user_id, consumed_at)` index. Migration
  `drizzle/0015_real_proudstar.sql`.
- Four API routes under `/api/account/2fa/*`:
  `setup` (generate secret + QR data URL), `enable` (verify code,
  persist encrypted secret + 10 fresh recovery codes), `disable`
  (require current password), `verify` (TOTP or recovery code,
  rate-limited per-IP).
- Pages: `/settings/account/2fa` (setup, view enabled state,
  remaining recovery codes, disable behind password), `/signin/2fa`
  (verify on sign-in, supports recovery codes).
- NextAuth integration: `Credentials.authorize()` surfaces
  `totpEnabled: boolean`; the JWT callback puts `requires2FA` on
  the token; middleware (now Edge-compatible) reads the JWT +
  verifies the MFA cookie before letting protected pages through.
- Cookie uses Web Crypto in middleware (Edge runtime), `node:crypto`
  HMAC in API routes. Constant-time comparison both sides.
- Account-settings index now links to the 2FA page.

**New customer-facing pages:**
- `/status` - real-time public status page running the same checks
  as `/api/health`: database, encrypted proxy, email (Resend),
  billing (Dodo), error reporting, admin panel. Each subsystem
  gets an Operational / Degraded / Down / Not-configured badge
  with a one-line hint. Server-rendered on every load.
- `/roadmap` - three-section public roadmap (Recently shipped /
  In progress / Next). Items link back to specific changelog
  entries when available.
- PublicFooter Product column gains Roadmap + Status links.

**Annual billing scaffolding:**
- `PlanLimits.annualPriceCents` added to the catalog. Hosted is
  set to `$120/year` ($10/user/mo, ≈17% off the monthly $12).
- BillingPanel exposes a Monthly / Annual toggle with a "−17%"
  pill on the annual side. Toggle re-renders the price card; the
  underlying checkout still routes through the existing monthly
  Dodo product until the operator publishes an annual product
  (then we just swap the product id).

**Sentry instrumentation example:**
- New `instrumentation.example.ts` at the repo root - drop-in
  template for wiring `@sentry/nextjs` against the existing
  `reportError()` shim. No new dependency required; the example
  installs and ignites Sentry only when the operator opts in by
  copying the file and setting `SENTRY_DSN`.

**More Playwright coverage:**
- `e2e/account.spec.ts` (10 specs) covers `/forgot` (form +
  enumeration-resistant submit), `/reset/<garbage>` rendering,
  `/signin/2fa` + `/settings/account` + `/settings/account/2fa`
  redirecting to `/signin` when not authenticated, `/roadmap` +
  `/status` rendering their headline sections, and two API-level
  400-rejection cases.

**Plumbing:**
- Middleware rewritten to handle both CSRF (existing) AND 2FA
  enforcement (new). Single matcher covers `/api/*`, `/c/*`,
  `/connections/*`, `/settings/*`, `/admin/*`.
- `/api/email/status` (already shipped) is now picked up by the
  status page check.
- Build still green, typecheck clean, 116 unit tests + 19 e2e
  specs ready to run.

## v3.7.0 · 2026-05-15 · Production-readiness Tier 2 (partial)

Three Tier-2 items shipped: product analytics scaffolding, a
Playwright end-to-end harness, and payment-history (invoice
download) on the billing page. **2FA is deferred** to a dedicated
ship - half-implementing it would risk lockouts.

**Analytics (env-driven, no footprint until enabled):**
- New module `src/lib/analytics` with `track()`, `identifyUser()`,
  `resetAnalytics()`. Dynamically loads `posthog-js` only when
  `NEXT_PUBLIC_POSTHOG_KEY` is set; honours `navigator.doNotTrack`;
  no automatic event capture (explicit `track()` calls only - too
  noisy + privacy-leaky on a data-admin tool).
- `AnalyticsBoot` mounted inside Providers identifies the signed-in
  user (id + email + name + plan, never row data).
- Wired first events: `checkout_started` (from BillingPanel),
  `resetAnalytics` on sign-out.

**Playwright end-to-end:**
- `playwright.config.ts`. Chromium project, auto-spawns `pnpm dev`
  locally, traces + screenshots + video on retry/failure.
- `e2e/smoke.spec.ts` - 9 specs covering the public surface that
  must not break on deploy: home, sign-in, forgot-password,
  accessibility, VPAT, pricing, `/api/health` shape, `/connections`
  anon redirect, `/admin` 404s without allowlist.
- New scripts: `pnpm test:e2e`, `pnpm test:e2e:ui`.

**Payment history:**
- `listCustomerPayments()` on the Dodo client fetches the last 20
  payments for the user's `dodo_customer_id`.
- BillingPanel renders a "Payment history" table with date, amount,
  status, and **PDF invoice link** (Dodo-hosted). Customers no
  longer have to dig through receipt emails to find an invoice.

**No schema changes. 116 tests pass, typecheck + build green.**

**Still on Tier 2:** 2FA, real load test (external), SOC 2
readiness (external), customer support ticketing (external).

## v3.6.0 · 2026-05-15 · Production-readiness Tier 1

Closes the operator-blocking gaps from the production-readiness
audit. Five customer-facing surfaces + three operator tools + the
plumbing to make all of it observable.

**Customer:**
- **Forgot-password flow**: `POST /api/account/forgot-password` issues
  a single-use, SHA-256-hashed, 1-hour token; `POST /api/account/reset-password`
  consumes it and bcrypts the new password (cost 12). Pages at
  `/forgot` and `/reset/[token]`. Enumeration-resistant (always 200,
  whether the email exists or not). Per-IP rate-limited via the
  signup bucket. Migration `0014_cuddly_fabian_cortez.sql` adds
  `password_reset_token`. SignInForm "Forgot?" now links to `/forgot`.
- **Self-service account deletion**: `/settings/account` exposes a
  Danger Zone with a typed-confirmation Delete button. Cascades
  through every `ON DELETE CASCADE` FK (connections, subscriptions,
  agent sessions, dashboards, custom actions, etc.). `audit_log` and
  `billing_event` retain rows with NULL user_id for forensics.
  Fulfils GDPR Art. 17. Settings index now lists the page.
- **Onboarding empty state**: `/connections` for new users renders
  a 3-step "what is Suparbase" panel with a single primary CTA.
- **Free-tier usage bar**: `/connections` shows
  "1 / 1 connection · at limit · upgrade" with a real progress bar
  for Free users. "New connection" button switches to "Upgrade to
  add" once they hit the cap.

**Operator:**
- **`/api/health` upgraded** to return `{ db, email, billing,
  observability, version }` - operator can curl after deploy and
  verify every integration is wired. Returns 503 only when the DB
  is unreachable; missing integrations report `false` without
  failing the probe.
- **Error-reporting shim** at `src/server/observability/report.ts`.
  Routes errors to the structured logger by default; when
  `SENTRY_DSN` is set, hands off to a globally-registered Sentry
  client (set via Next's `instrumentation.ts` on the operator's
  side). `reportError()` is the single call site we can grep for
  when we wire a real provider.
- **Global error boundary** at `src/app/global-error.tsx` - the
  top-level UI a customer sees when Next catches an unhandled
  exception. Logs to console (which Sentry's browser SDK picks up
  when loaded) and shows the digest so the operator can match logs
  to user reports.
- **Admin audit search** at `/admin/audit` - multi-field filter
  (user, connection, schema, table, verb, date range) against the
  `audit_log` table for forensic queries. Backed by the
  `audit_conn_recent_idx` we added in v3.4.3. Refuses to scan
  without at least one filter set.
- **Admin user detail extras**: `/admin/users/[id]` now shows the
  user's connections list and a one-click "View audit log for this
  user" link that pre-fills the audit search.

**Touched:**
- `src/server/auth/password-reset.ts` - token issuance + consumption +
  bcrypt update, all in a transaction.
- `src/server/auth/delete-account.ts` - single-statement cascade.
- `src/server/email/templates/password-reset.ts` - themed email.
- `src/server/observability/report.ts` - `reportError()` + `hasErrorReporter()`.
- `src/server/admin/audit-search.ts` - filtered + counted queries.
- New pages: `/forgot`, `/reset/[token]`, `/settings/account`,
  `/admin/audit`, plus the global error boundary.
- `/api/health` extended; `SENTRY_DSN` placeholder added to `.env.example`.

## v3.5.2 · 2026-05-15 · Single contact email

Standardised every customer-facing email address to **contact@suparbase.com**.
Previously we exposed `hello@`, `security@`, `privacy@`, `legal@`, and
`accessibility@` across various pages - five inboxes nobody actually
read. One inbox is easier to staff, route, and keep responsive.

Touched: privacy, terms, about, docs, accessibility, accessibility/vpat,
pricing, BillingPanel, PublicFooter, healthcare-saas use-case, CONTRIBUTING.
Env-example placeholders (`invites@yourdomain.com`,
`support@yourdomain.com`) unchanged - they're sample values, not real
addresses.

## v3.5.1 · 2026-05-15 · UI bug pass + WCAG 2.2 swap

Big polish ship. Closes every BLOCKER + HIGH + most MEDIUMs from the
v3.5.x UI audit, swaps the accessibility statement + VPAT to WCAG 2.2
Level AA (was 2.1), and replaces 12 native `window.confirm()` calls
with a themed `ConfirmDialog` for destructive actions.

**Real bugs:**
- `formatCellValue` rendered a literal colon (`":"`) for NULL values
  across the data grid, row detail, AI chat results, and inline
  previews. Now renders `"-"`.
- `TableListView` StatTiles fell back to `":"` while loading; same fix.
- `GenericRow.leadDisplay` ran `String(value)` on jsonb / array
  columns and printed `[object Object]`. Now uses `formatCellValue()`.
- `/docs` "Settings → AI" link pointed at `/connections`. Fixed.
- Landing-hero "supabase.com →" link actually opened
  `github.com/supabase/supabase`. Fixed.
- `Button` base class disabled focus-visible outline without adding a
  replacement ring. Keyboard users had no visible focus on any button.
  Added `focus-visible:ring-2 ring-accent ring-offset-2`.
- Cancelled / expired Hosted users couldn't re-subscribe - the
  `isUpgrade` short-circuit treated them as "current plan". Now exposes
  a **Resubscribe** CTA.
- Sonner toast theme was hard-coded `"dark"` then later `"system"`,
  which ignored the user's manual `ThemeToggle` override. Now reactive
  to `document.documentElement.dataset.theme` via MutationObserver.
- Float column inline editor was missing `step="any"`; `0.25` was
  rejected as invalid input.
- `User.name` rendering as empty when name was null in the topbar /
  app-header dropdowns. Now falls back to email.

**12 destructive ops → themed ConfirmDialog:**
- New `<ConfirmDialog>` component (`src/components/ui/confirm-dialog.tsx`)
  + `useConfirm()` hook (`src/lib/ui/use-confirm.ts`). Supports the
  "type DELETE to confirm" gate via the `requireText` prop.
- Replaced `window.confirm()` in: storage bucket delete (with
  type-DELETE gate), storage object batch delete, agent-session undo,
  SQL playground write-mode toggle, auth-user delete (type-DELETE
  gate), revoke-all-sessions, dashboard widget delete, custom action
  delete, team-member remove, team-invitation revoke, Postgres URL
  clear, chat-conversation delete, and the admin Reset Subscription
  (type-RESET gate). The admin Reset previously had **zero**
  confirmation - clicking it instantly wiped Dodo IDs.

**Mobile UX:**
- Row action "..." menus across 9 components (TableListView,
  ConnectionList, 5 preset list views, DashboardWidgets,
  EditableField pencil) were `opacity-0 group-hover:opacity-100` and
  invisible on touch devices. Now visible by default on mobile,
  opacity-toggle only on `md:` breakpoints.
- TableListView page-select checkbox now has a visible label on
  mobile (was hidden via `hidden sm:inline`).

**Empty states + auto-clear:**
- `/admin/users` "No users match." now branches between "no users
  match `<search>`" + Clear-search link vs "No users yet." for empty
  table.
- `TableListView` empty filtered state now offers a Clear-search
  button so users don't have to scroll back up to the input.
- Admin grant / reset form status messages auto-clear after 4s instead
  of lingering indefinitely.

**Linkable hints / wired paywalls:**
- `ErrorBanner` hints for `plan_limit` and `no_key` are now real
  links into the relevant settings page, not plain text the user
  has to copy.
- Team-invite 402 (`category: "plan_limit"`) now renders the
  `PaywallCard` with an upgrade CTA, matching the connection-form
  flow.
- BillingPanel humanises raw status strings (`on_hold` → "Paused
  payment issue", `cancelled` → "Cancelled", `failed` → "Past due").
  Cliff-date label switches between "Trial ends" / "Renews" / "Ended"
  per status.

**Routing:**
- Topbar + AppHeader account dropdowns gain a **Billing & plan** entry
  (was missing despite billing now being a primary destination).
- Chat markdown links to internal routes (`/c/[id]/...`, `/settings/...`)
  now use Next.js `<Link>` for client-side navigation instead of
  opening new tabs.
- SignInForm "Forgot?" tooltip now also fires a toast on tap (mobile
  users couldn't see the hover-only tooltip).

**Table overflow:**
- `/admin/billing` and `/agent-sentry` comparison tables wrapped in
  `overflow-x-auto` so they don't blow up the page layout on mobile.

**Accessibility statement + VPAT:**
- Both updated from **WCAG 2.1** Level AA to **WCAG 2.2** Level AA.
- Six new 2.2 criteria added to the VPAT with honest conformance
  calls and remarks:
  - 2.4.11 Focus Not Obscured (Minimum). Supports
  - 2.5.7 Dragging Movements. Supports
  - 2.5.8 Target Size (Minimum). Partially (filter-chip X,
    inline-edit confirm/cancel, password-eye toggle are below 24×24)
  - 3.2.6 Consistent Help. Partially (contact appears on most
    pages but in different positions)
  - 3.3.7 Redundant Entry. Supports
  - 3.3.8 Accessible Authentication (Minimum). Supports
- 4.1.1 Parsing removed (obsolete in 2.2).
- WCAG link points at the 2.2 spec.

## v3.5.0 · 2026-05-15 · Accessibility pass + VPAT 2.5

Honest accessibility documentation backed by a real audit + 5 quick
fixes that close the gaps the audit flagged. New pages at
`/accessibility` (plain-English statement) and `/accessibility/vpat`
(VPAT 2.5 Rev conformance report). Both linked from the public
footer's Company column.

**Quick wins shipped (the VPAT now reflects these):**
- **Skip link** on every page (`/src/app/layout.tsx`) jumps to the
  `<main id="main">` landmark in each layout. Flips WCAG 2.4.1
  Bypass Blocks from "Does Not Support" → "Supports".
- **Bare-label form fields patched**:
  - TeamMembers invite (Email + Role) now use `htmlFor`/`id` pairs.
  - `ActionsManager`'s `Field` helper wraps `<label>` around its
    contents so any input descendant auto-associates.
  - `EditableField` inline editor gives every editor field an
    `aria-label={"Edit " + column.name}` so screen readers announce
    which column is being edited.
- **`title="..."` tooltips replaced with Radix Tooltip** in
  `SignInForm` ("Forgot?") and `Topbar` ("Refresh schema"). Now
  keyboard-reachable + screen-reader-exposed + dismissible.
- **AI chat marked as a polite live region** (`role="log"`,
  `aria-live="polite"`, `aria-relevant="additions text"`,
  `aria-label="AI assistant conversation"`). Streamed assistant
  responses are now announced.
- **Sonner toaster** changed from hard-coded `theme="dark"` to
  `theme="system"` so light-mode users get light-mode toasts.

**New pages:**
- `/accessibility` - plain-English statement: what's solid, what's
  partial, what doesn't apply, how to report issues, contact at
  `accessibility@suparbase.com`. Realistic about color-contrast
  verification not being tool-measured.
- `/accessibility/vpat` - full VPAT 2.5 Rev: Product Information,
  Standards Covered, Terms, WCAG 2.1 Level AA criterion-by-criterion
  table (all 45 criteria), Revised Section 508 functional-performance
  table, EN 301 549 V3.2.1 chapter mapping, legal disclaimer, and
  revision history. Every "Supports / Partially / Does Not Support /
  Not Applicable" cell traces back to specific code observations or
  honest "couldn't fully verify" notes.

**Footer:** new "Accessibility" link in the Company column,
between Terms and Contact.

**No application behaviour changes** beyond the live-region + label
additions and the toast theme switch. Pure accessibility hardening
+ documentation.

## v3.4.3 · 2026-05-15 · Database optimisation pass

Schema-level + query-level performance pass. No behaviour changes;
everything makes existing reads cheaper as the tables grow. One
additive migration (drops + recreates indexes; no data touched).

**New / replaced indexes (`drizzle/0013_daily_gamora.sql`):**
- `audit_log`: replaced three narrow single-column indexes (`user_idx`,
  `connection_idx`, `session_idx`) with two compounds that match the
  actual access patterns
  - `audit_conn_recent_idx (user_id, connection_id, created_at DESC)`
    serves every recent-audit, undo, AI-tool, and detail-page read in
    one index hit (was: bitmap-AND across two narrow indexes).
  - `audit_session_created_idx (session_id, created_at DESC)` serves
    the "show me what this Cursor session did" view.
  - `audit_created_at_idx` kept for the retention sweep.
- `audit_log`: new GIN `jsonb_path_ops` index on `primary_key` so the
  row-history `@>` query (`POST /api/v/[id]/audit/row`) doesn't
  seq-scan the per-connection shard. Hot read in the row-detail page.
- `agent_session`: replaced both compounds with one
  `(user_id, connection_id, kind, status, last_seen_at DESC)` that
  covers the proxy hot-path `attachToSession` lookup AND the
  `listSessions` read via the (user, conn, …) prefix.
- `connections`: replaced bare `(user_id)` with
  `(user_id, last_used_at DESC)` so `listConnections` can push the
  ORDER BY into Postgres (was: JS sort after fetching all rows).
- `sentry_finding`: replaced `(user_id, conn_id, status)` with
  `(user_id, conn_id, status, last_seen_at DESC)` to skip the heap
  sort on `listFindings`.
- `admin_action`: new `(created_at DESC)` for the global feed in
  `listRecentAdminActions` (was: full-scan + top-N sort).
- `billing_event_unapplied_idx` is now a **partial** index
  `WHERE applied_at IS NULL ORDER BY received_at DESC`. Tiny (only
  contains the tail you ever query), maintenance-free as rows drop
  out on apply.
- `pg_trgm` extension enabled + GIN trigram indexes on `users.email`
  and `users.name` so the admin user search (`ILIKE '%term%'`)
  doesn't full-scan once the user table grows past a few thousand.

**Query refactors:**
- `getConnectionAccess` is now one LEFT JOIN against `connection_member`
  instead of two sequential round-trips. Every protected API route
  shaves one round-trip - the single highest-frequency read in the
  codebase.
- `listUsers` in the admin panel replaced the correlated `(SELECT
  count(*) FROM connections WHERE user_id = users.id)` (which ran
  N times per page) with a CTE-based pre-aggregation. One GROUP BY
  scan + a hash join, regardless of page size.
- `listConnections` pushes its ORDER BY into Postgres via the new
  `(user_id, last_used_at DESC)` index.
- `touchLastUsed` now throttles: writes only when `last_used_at` is
  >60s stale. Previously every successful proxied write contended on
  the same row lock + wrote WAL; under load this was meaningful
  serialisation.

**Concurrency safety:**
- `bumpSession` no longer reads `tablesTouched` into JS and writes it
  back (which was racy under concurrent writes - two writers could
  silently lose each other's table additions). The union now happens
  inside Postgres via a `CASE WHEN ... @> ... THEN ... ELSE ... || ...`
  expression on the jsonb column.

**Retention safety:**
- `runRetention()` deletes from `audit_log` in batches of 5000 rather
  than one statement. A 50M-row purge would have held row locks and
  WAL for the whole transaction; batched chunks keep individual
  statements bounded. Iteration cap at 200 batches per run (1M rows)
  so a runaway never holds the cron handler open - anything bigger
  gets caught on the next tick.

No app-visible changes. Existing reads get faster proportional to
table size; writes get a tiny boost from fewer indexes on
`audit_log` and `agent_session`.

## v3.4.2 · 2026-05-15 · Billing hardening

Iron-clad audit pass over the v3.4 surface. No new features - every
change closes a latent bug, a coverage gap, or a consistency hole.
Total: 21 new tests (116 passing), one additive migration.

**Real bugs fixed:**
- **Webhook idempotency now tracks "applied" separately from
  "received".** Previously, if `applyEvent` threw (transient DB
  error, etc.) we returned 200 and the unique-violation short-circuit
  swallowed every retry - the subscription stayed desynchronised
  forever. New `billing_event.applied_at` column + the receive/apply
  split: failed applies now return 5xx so Dodo retries; the next
  receipt finds `applied_at IS NULL` and re-runs the mutation.
- **Admin grants now honour their own `expiresAt` cliff.** The
  resolver was OR-ing the admin flag with the cliff check, so a
  comp account set to expire on a specific date stayed entitled
  forever. Now: open-ended grants stay open-ended, dated grants
  expire as configured.
- **Tautology in webhook `applyEvent`** (`plan: ... ? plan : plan`)
  removed. The intent - "downgrade on expire/cancel" - is already
  handled by the resolver via status; the `plan` column is always
  `hosted`.
- **`/admin/users/<garbage>` no longer 500s.** UUID format checked
  before the Postgres query; malformed paths `notFound()`.
- **`PaywallCard` now actually renders.** When `/api/connections`
  returns 402 with `category: "plan_limit"`, the connection form
  shows the paywall card with the upgrade CTA instead of a generic
  error.
- **`plan_limit` added to `ErrorCategory`** + matching strings in
  `ErrorBanner`. Previously the code referenced a category the type
  union didn't include - only worked because of an `as` cast.

**Consistency:**
- MRR maths in `/admin` now reads from `PLAN_LIMITS.hosted.monthlyPriceCents`
  (was a hardcoded `1200`). Single source of truth.
- Trial length centralised as `PLAN_LIMITS.hosted.trialDays = 7`.
  Checkout route + billing page CTA both pull from the catalog
  bumping the trial to 14 days is one edit.
- `PlanLimits.maxConnections` is now `number | null` (null = unlimited).
  Previously `Number.POSITIVE_INFINITY`, which JSON-serialises to
  `null` and broke the client-side display check for the Hosted card.
- Admin grant `expiresAt` is now end-of-day UTC (23:59:59), so "grant
  through Dec 31" actually entitles the user for all of Dec 31, not
  the start of it.

**Tests** (21 new):
- `tests/dodo-events.test.ts` - pure event-name → status mapping
  pinned for all 8 subscription events + trial detection + date
  parsing + unrecognised events.
- `tests/billing-plans.test.ts` extended with regression guards for
  the admin-grant cliff bug + the null-sentinel unlimited cap.

**Defence-in-depth:**
- Webhook secret parsing - replaced the misleading `try/catch` (which
  never caught) with an explicit base64 regex + length check. The
  utf-8 fallback now only fires when the secret genuinely isn't
  base64.
- Admin server actions `notFound()` on non-admin (was returning a
  JSON error that confirmed the URL existed).
- Unrecognised webhook event types are logged at `info` and marked
  applied (we don't retry forever) instead of leaving an event
  recorded-but-unapplied.

**Operator surface:**
- `/admin/billing` now shows an amber callout listing events that
  were received but not yet applied - the operator's first stop when
  a payment landed but the user's plan didn't flip. The main table
  gains an "Applied" column (✓ / pending).
- `PRODUCTION.md` gains a v3.4 billing + admin smoke checklist
  (~10 min walk-through covering admin grant cliff, hard limits,
  webhook idempotency, and the checkout round-trip).

**Plumbing:**
- New module `src/server/billing/dodo-events.ts` houses the pure
  event-mapping logic, extracted from the route handler so it can be
  unit-tested without a DB or HTTP harness.
- Migration `drizzle/0012_organic_quasar.sql` adds
  `billing_event.applied_at` + `billing_event_unapplied_idx`.
  Additive only - existing rows backfill to `NULL` (treated as
  unapplied - the apply will idempotently re-run on next receipt).

## v3.4.1 · 2026-05-15 · Signed-in browsing fixes

Two routing nits from the v3.4 ship reported by the operator:

- **Homepage no longer redirects signed-in users.** `/` used to bounce
  to `/connections` whenever a session was present, which blocked
  signed-in users from sharing the marketing page or following a link
  from the changelog back to the landing surface. Removed the
  redirect; the nav still offers an "Open workspace" CTA for one-click
  return to `/connections`.
- **Pricing page redirects signed-in users to `/settings/billing`.**
  The marketing pricing surface isn't useful to an existing customer
  - they already have an account and need the in-app plan view (with
  their current state + upgrade CTA). Pricing now `redirect()`s
  whenever a session is present.
- **Pricing + Sign-up links hidden** from the public nav and footer
  for signed-in users (PublicNav `hideWhenSignedIn` flag, PublicFooter
  accepts an `isSignedIn` prop the layout passes down).

## v3.4.0 · 2026-05-15 · Dodo Payments billing + admin panel

The free tier becomes actually limited, the paid tier becomes
actually billable, and the operator gets a window to see what's
happening. Spec: [`specs/032-dodo-billing-admin/`](specs/032-dodo-billing-admin/).

**Billing.** New `subscriptions` and `billing_events` tables. The
`Hosted` plan ($12/user/mo, 7-day trial) is sold via Dodo Payments'
hosted checkout (product `pdt_0Nev0FKdzw0UxPeUBKItA` - "Supar Saver").
The checkout call lives in `src/server/billing/dodo.ts`; the webhook
handler at `POST /api/webhooks/dodo` verifies the Standard Webhooks
signature (HMAC-SHA256 of `${webhook-id}.${webhook-timestamp}.${body}`,
5-min replay tolerance), dedupes by `webhook-id`, and applies state
changes for `subscription.active`, `.renewed`, `.on_hold`,
`.cancelled`, `.expired`, `.failed`, `.updated`, `.plan_changed`.
Integration is env-driven (`DODO_API_KEY`, `DODO_WEBHOOK_SECRET`,
`DODO_HOSTED_PRODUCT_ID`, `DODO_MODE`) - without those, the billing
UI shows "coming soon" and the app still boots.

**Hard limits.** Free tier is now capped at 1 connection (further
`POST /api/connections` returns 402 with `category: "plan_limit"`)
and 0 team invites (`POST .../members/invitations` returns 402 for
free-tier owners). The plan resolver (`src/server/billing/plans.ts`)
treats lapsed paid statuses (cancelled / expired / on_hold / failed)
as Free, so an expired sub doesn't keep extras alive.

**Customer billing surface.** New `/settings/billing` page shows
current plan, trial cliff or renewal date, and a plan-comparison
table with a "Start 7-day trial" CTA that kicks off Dodo checkout.
Cancel / payment-method updates go through Dodo's customer flow via
the receipt email - we don't duplicate that form in-app.

**Admin panel.** New `/admin` surface, gated by an env allowlist
`SUPARBASE_ADMIN_EMAILS` (CSV, lowercased compare). 404s for
everyone else - we don't acknowledge it exists. Pages:
- `/admin` - dashboard: total users, signups in last 7 days, paying
  users, est. MRR.
- `/admin/users` - searchable list of all users with their plan,
  status, connection count.
- `/admin/users/[id]` - grant a plan (Hosted or Team, with an
  optional cliff + note - recorded as comped, no Dodo charge), reset
  a subscription back to Free, view recent billing events for this
  user.
- `/admin/billing` - last 200 webhook receipts for debugging.
Every admin action writes an `admin_actions` audit row BEFORE the
mutation so half-failures still leave a trace.

**New tests** (3 new files, 33 new tests, total 95 passing):
- `tests/dodo-webhook.test.ts` - signature verification (valid,
  tampered, wrong secret, stale, missing headers, multi-version
  header, whsec_ prefix handling).
- `tests/billing-plans.test.ts` - `resolvePlan` collapses lapsed
  statuses to Free; `requireFeature` enforces per-plan caps for
  every (plan, status, feature) cell.
- `tests/admin-guard.test.ts` - env CSV parsing case-insensitivity,
  whitespace tolerance, empty handling.

**Plumbing.** New `/api/webhooks/*` middleware exemption (webhooks
are auth'd by HMAC, not by Origin). Migration
`drizzle/0011_adorable_tombstone.sql` adds the three new tables
(`subscription`, `billing_event`, `admin_action`) - additive only,
no destructive change.

## v3.3.1 · 2026-05-15 · GitHub links removed + Signal panel refresh

Follow-up to v3.3.0. With the product repositioned as privately held,
the remaining public GitHub links no longer fit. All source-repo links
removed site-wide; the footer Signal panel rewritten with concrete,
current numbers.

- **`PublicNav`**: top-right "GitHub" button removed.
- **`PublicFooter`**: legal-strip "issues" link removed (now "Contact");
  Resources column's "Report an issue" entry replaced with "Contact"
  (mailto). The Signal panel rewritten:
  - "Latest release" now shows the version + release month.
  - "Just published" renamed to "From the blog".
  - Stale "Features 9 in production" replaced with "Shipped 30
    features across 30 specs" (links to the changelog).
  - Redundant "Plans" row replaced with "Free tier · 1 project · no card".
  - Live indicator updated to a pulsing dot for stronger affordance.
  - Trailing copy reworked to focus on shipping cadence rather than
    repeating the pricing CTA.
- **About page**: "Browse the specs" card link → /changelog. "Report
  an issue" card link → mailto.
- **Blog index page**: "follow the GitHub repo for release notes" line
  removed.
- **Changelog page**: top-right "GitHub releases" button and per-release
  "release notes" deep links removed (changelog is now the canonical
  release surface).
- **Docs page**: "Self-host" section + sidebar entry removed (self-hosting
  is no longer a public option; Team plans get single-tenant deployments
  via sales). Help callout points to email instead of GitHub issues.
- **`organizationLd`** (structured data): `sameAs` array removed; the
  GitHub URL is no longer surfaced to search engines.
- **`SITE.github`**: constant removed from `src/lib/seo/site.ts`.

GitHub OAuth on the sign-in / sign-up pages is **unchanged**: that's
the social-login provider, not a link to the source.

## v3.3.0 · 2026-05-15 · Proprietary licensing + free hosted tier

Repositioning release. Suparbase is now a privately held product
with a free hosted tier. No code-behaviour changes; every update is
to licensing, copy, and marketing surfaces.

- **`LICENSE`**: replaced with a proprietary copyright notice. All
  rights reserved.
- **`package.json`**: `"license"` field set to `"UNLICENSED"`.
- **`README.md`**: License shield and section removed. Contributing
  section renamed Feedback and pointed to the issue tracker for bug
  reports; no external code contributions accepted.
- **`CONTRIBUTING.md`**: rewritten as a short issue-reporting guide.
  External code contributions are no longer accepted; bug reports
  and security disclosures are still welcomed.
- **Pricing page** (`src/app/pricing/page.tsx`): the self-host tier
  was replaced with a **Free** hosted tier (1 connection, 1 user,
  no card, no expiry). Hosted and Team tiers retained. Subtitle,
  signal badges, FAQ entries, and final CTA all reworded.
- **Terms page** (`src/app/terms/page.tsx`): the self-host section
  was removed. Service description and warranty clauses reworded.
- **Privacy page** (`src/app/privacy/page.tsx`): the self-hoster
  carve-out was removed from the subtitle and subprocessor section.
- **About page** (`src/app/about/page.tsx`): the prior licensing
  card was replaced with "Free tier, forever". GitHub link
  repositioned to /issues for bug reports.
- **Agent Sentry page** (`src/app/agent-sentry/page.tsx`): CTA body
  no longer mentions self-host. "Read the source" button replaced
  with "See pricing".
- **Landing page** (`src/app/page.tsx`): promise list and final CTA
  reworded to lead with the free hosted tier.
- **Footers** (`AuthShell`, `AppFooter`, `PublicFooter`): licensing
  badges and the legal strip were removed. GitHub repo links
  repositioned to the issues page where they remain visible.
- **Site metadata** (`src/lib/seo/site.ts`): page description
  reworded to focus on the hosted product.
- **Article CTA** (`src/components/public/ArticleLayout.tsx`): card
  shown beneath every blog post / guide reworded.
- **Marketing content**: agent-sentry-2026 blog, healthcare-saas /
  saas-admin / vibe-coders use-case pages, and the suparbase-vs-
  supabase-studio comparison all dropped self-referential licensing
  claims. Third-party mentions (Postgres, Supabase, libSQL,
  Weaviate, etc.) preserved - they describe other products.
- **`SECURITY.md`**: minor reword to remove self-hoster references
  from the supported-versions and out-of-scope sections.

No runtime, schema, or behavioural changes. Existing customers see
new pricing copy on the website; nothing in the product changes.

## v3.2.2 · 2026-05-15 · Widget AI: forbid `$N` placeholders

Bugfix. The widget-builder model occasionally leaked the actions-style
`$1..$N` parametrisation into widget SQL (e.g. prompt "Tool usage by
daily basis" → `where created_at > $1`). Widgets run unparametrised
through `executeSql`, so Postgres returned a generic "syntax error at
or near $1" that didn't point at the real cause and didn't tell the
user how to recover.

- **`src/server/ai/widget-generate.ts`**: system prompt now explicitly
  forbids `$N` placeholders and tells the model to bake the literal
  value into the SQL using `NOW()`, `CURRENT_DATE`, or `INTERVAL`
  literals. Added a belt-and-braces pre-execution check (`/\$\d+/`)
  that rejects with a clear "use literal values, not placeholders"
  message before the SQL ever reaches Postgres.
- **`POST /api/connections/[id]/widgets/ai-generate`**: `malformed`
  category now maps to HTTP 422 instead of 502 - it's the model's
  output that failed validation, not an upstream incident, and the
  user can fix it by rephrasing.

## v3.2.1 · 2026-05-15 · AI-powered action builder

Same shape as v3.2's widget AI, applied to custom actions. Describe
the button in English, the AI builds the SQL template or webhook
config, you review and save.

- **`src/server/ai/action-generate.ts`**: focused prompt returning a
  strict Zod-validated `GeneratedAction` shape covering name (slug),
  label, description, scope (global/table/row), kind (sql/webhook),
  sqlTemplate with `$1..$N` placeholders, params array, danger flag,
  webhookUrl/Method. Defensive code-fence stripping. The system
  prompt covers all the action conventions: row-scope uses $1 for
  the PK payload, params start at $2 in row-scope, ALWAYS WHERE for
  row actions, danger=true for irreversible ops, webhook URLs must
  be public hosts.
- **`POST /api/connections/[id]/actions/ai-generate`**: editor+
  role, AI rate-limit bucket. Loads OpenRouter key, introspects
  the schema (surfaces the focus table in full when the UI provides
  one), generates the action, then runs three structural safety
  passes:
  - `validateScopeShape`: scope ≠ "global" must have a tableName
  - `validateSqlPlaceholders`: counts `$N` in SQL, confirms it
    agrees with `params.length + (1 if row-scope)`
  - `validateGeneratedWebhook`: routes the URL through the same
    `validateWebhookUrl` the save path uses (blocks SSRF targets +
    cloud-metadata + IPv6 loopback)
  A 422 still returns the generated action so the UI can populate
  the form anyway - the user can fix the issue inline.
- **Editor UI**: collapsible "Generate with AI" panel above the
  action form, mirrors the widget editor's pattern. Default open
  for new actions, closed on edit. Passes the form's current
  scope/kind/table context so the model gets pre-narrowed defaults;
  the model can override. Errors show a danger pill but the form
  is still populated so the user can fix and save.

No new dependency, no new key. Reuses the existing OpenRouter
integration the chat + widget builder already use.

## v3.2.0 · 2026-05-15 · AI-powered widget builder

Tag: `v3.2.0`

You can now build dashboard widgets by describing them in natural
language. Reuses the OpenRouter integration that was already wired
for the AI chat.

- **New `src/server/ai/widget-generate.ts`**: focused one-shot
  prompt that gets back a strictly-typed widget config. The system
  prompt locks the response to SELECT-only SQL, named columns
  matching the introspected schema, and a Zod-validated shape
  (`type / title / sql / visConfig`). Extra defensive guards:
  strip code-fence wrapping, refuse non-SELECT, fail validation
  if Zod doesn't accept the result.
- **New `POST /api/connections/[id]/widgets/ai-generate`**: takes
  `{ prompt }`, returns `{ widget, preview }`. Role-gated to
  editor+, AI bucket rate-limited. Server-side:
  1. Auth + role check
  2. Pull OpenRouter key + model from user settings
  3. Introspect the connection's schema
  4. Generate widget config via OpenRouter (temperature 0, JSON
     response format)
  5. Execute the generated SQL read-only with a 5s timeout to catch
     hallucinated column names and syntax errors at API time, not
     save time
  6. Return the config + first 5 preview rows
  Failures at step 5 return a 422 with the Postgres error in the
  body, so the UI can prompt the user to rephrase.
- **Editor UI**: new collapsible "Generate with AI" panel at the
  top of the widget form. Default open for new widgets, closed on
  edit. Prompt textarea + Generate button with a spinner; on
  success the form below is populated with type / title / SQL /
  visConfig and an inline preview table shows the first 5 rows
  from the generated query. Model name is shown so the user knows
  which model produced it.
- **Error surfaces**: no OpenRouter key in settings → friendly
  "Add a key in Settings → AI" message; hallucinated column → the
  exact Postgres error inline; rate limit → 429 with Retry-After.

The user reviews the populated fields and clicks Save just like
the existing manual flow. No new column saved, no new schema
table - the widget that ends up in `dashboard_widget` is identical
to one a human typed by hand.

## v3.1.5 · 2026-05-15 · Production hardening pass

Eight items closed, every gap from the production audit that's
fixable without a real Supabase project to validate against. The
remaining "actually run it" steps live in the new
[PRODUCTION.md](PRODUCTION.md).

**Session cache**: TTL dropped from 5 min to 60 s so cross-instance
staleness windows are bounded; hard `MAX_CACHE_ENTRIES = 2048` cap
with LRU eviction on insert; `touchLru` on read.

**Rate limits everywhere destructive**: new
`src/server/security/route-guards.ts` with `limitOr429()`. Applied
to action create / update / delete, widget create / update / delete,
sentry finding mutate, quarantine apply + dismiss, member mutate +
remove, invitation create + revoke. Undo session uses the AI bucket.

**Audit retention**: new `src/server/audit/retention.ts` prunes
audit_log / sentry_scan / resolved sentry_findings / closed
agent_sessions on configurable windows. New `/api/cron/retention`
route gated by `CRON_SECRET` Bearer auth; fail-closed when secret
isn't set.

**Structured redacted logger**: new `src/server/log.ts` emits JSON
lines with `level / msg / ts / ctx`. Every value runs through the
existing `redact()` so JWTs and provider tokens never reach the log
stream. Levels honour `LOG_LEVEL` env. Sentry / Logflare / Datadog
plug-in is a five-line `emit()` swap.

**CSRF at the edge**: new `src/middleware.ts` rejects cross-origin
POST / PUT / PATCH / DELETE on `/api/**`, `/c/**`, `/connections/**`,
`/settings/**`. Exempts `/api/auth/*` so NextAuth callbacks pass.

**Test coverage**: 9 new undo-SQL tests covering timestamptz, uuid,
bigint as string, numeric with decimals, text[] / int[] through
jsonb cast, jsonb with nested objects, Infinity / NaN → NULL,
composite primary keys, identifier + value quoting combined.
**62 tests total, all passing.**

**PRODUCTION.md**: 90-minute end-to-end validation checklist for
the v3 surface, plus launch-day hardening, observability,
backups, multi-instance gotchas, and deferred caveats.

**README**: "public beta (v3.1.5)" status badge + honest paragraph
about what's tested vs. what isn't, linking PRODUCTION.md.

**.env.example**: documents `CRON_SECRET` and `LOG_LEVEL`.

## v3.1.4 · 2026-05-15 · Two new marketing pages

Adding the only two pages with measurable ROI from the marketing
audit. Both registry-driven, so the sitemap and the `/compare` +
`/use-cases` hub pages picked them up automatically.

- **`/compare/suparbase-vs-supabase-studio`**: head-to-head with the
  official dashboard. 21-row feature matrix; honest "when Studio
  alone is enough" + "when Suparbase wins" sections; a dedicated
  section on credential-handling (Suparbase encrypts at rest, Studio
  holds the key in the browser session). Highest-intent comparison
  query for any Supabase user.
- **`/use-cases/vibe-coders`**: persona page for the audience reading
  Moltbook / Lovable CVE / PocketOS post-mortems. Hero links to the
  three real 2026 incidents, four cards covering Sentry probe +
  quarantine + per-agent attribution + session undo, four-step
  wire-it-up flow at the bottom. Different framing than `/agent-sentry`,
  same downstream conversion.

Both pages are pre-rendered via the existing `[slug]` routes,
included in `sitemap.xml` automatically.

## v3.1.3 · 2026-05-15 · Em-dash sweep + jargon explainers

No feature work. Two consistency passes:

**Em-dash sweep.** Replaced every em-dash (U+2014) in the repo with
either a comma (when surrounded by spaces) or a hyphen (when bare).
Affected ~70 files across `src/`, `specs/`, `CHANGELOG.md`, and the
root-level `*.md` files. Pure typography change, no behaviour.

**Jargon explainers on Sentry + Agents pages.** Both pages now ship
with a "What do these mean?" disclosure card sitting between the
PageHeader and the data:

- Sentry: defines Finding, Severity, Quarantine, Acknowledge,
  Resolve, Scan.
- Agents: defines Session, Mutation, Agent kind, Undo session,
  Active, Closed / Undone (+ undo_partial / undo_failed).

New reusable `TermsExplainer` component using native `<details>` for
keyboard accessibility, remembers open/closed state per-page via
localStorage. Open by default the first time a user lands on the
page.

## v3.1.2 · 2026-05-15 · Performance, viewer UX, tests, CI

Follow-up to the v3.1.1 audit. No feature work, strictly polish +
infrastructure. Found 2 real SSRF gaps along the way and fixed them.

**Performance** · proxy hot-path session cache
- `src/server/sentry/sessions.ts`: every authenticated write through
  the proxy used to do one extra DB roundtrip to attach to an agent
  session. Added an in-memory `Map` keyed by `userId:connectionId:kind`
  with the 5-minute session window as TTL. Cache hits skip the SELECT
  entirely and bump the session row asynchronously. Bounded eviction
  on each cold-path call. Invalidated when a session is undone so the
  next write opens a fresh one.

**Viewer UX** · stop showing buttons that 403
- `/api/connections/[id]/sentry` and `/api/connections/[id]/sessions`
  now return `myRole` so the client can render the right buttons.
- SentryDashboard hides Quarantine / Acknowledge / Resolve / Lift for
  viewers and shows a "viewer · read only" pill instead.
- AgentSessions hides the Undo button on the session drawer for
  viewers and shows the same pill.

**Tests** · vitest bootstrap + 53 unit tests
- `vitest.config.ts` + `tests/` with stubs for `server-only` and
  `@/server/db` so pure helpers can be loaded without booting Postgres.
- `tests/fingerprint.test.ts`, every UA pattern + the `ai_unknown` /
  `browser` / `cli` / `unknown` fallthroughs.
- `tests/undo-sql.test.ts`, every verb branch, identifier quoting,
  embedded quotes, null-byte stripping, jsonb fallback.
- `tests/webhook-ssrf.test.ts`, 20 blocked URLs + 5 allowed.
- **Two real bugs caught by the tests**: `::ffff:127.0.0.1` canonical
  form (`[::ffff:7f00:1]`) and `fdXX::/8` ULA range weren't matched
  by the v3.1.1 patterns. Fixed.
- `pnpm test` script added. New "Unit tests" step in CI.

**CI** · migration smoke check
- New `migrate-smoke` job in `.github/workflows/ci.yml` spins up a
  Postgres 16 service container, builds the production migrator,
  applies every `drizzle/*.sql` against an empty DB, then re-runs to
  prove idempotency. Catches schema-drift mistakes (typos, missing
  dependencies on a previous migration) before they reach Coolify's
  pre-`next start` migrator.

## v3.1.1 · 2026-05-15 · Hardening pass

Tag: `v3.1.1` · No new feature work, locking the v3 surface before
opening for outside contributors. Audit findings fixed:

- **[CRIT] Sentry anon probe false positives on service_role keys**:
  the probe used the stored apikey to fire unauthenticated GETs, but
  if that key is `service_role` it bypasses RLS, so every public table
  would be reported "anon-readable". When the connection's role is
  `service_role`, Sentry now skips the anon-probe channel and emits an
  explanatory `scan_error` finding instead. The pg_policies channel
  still runs.
- **[HIGH] Authorization gaps for team viewers**: every destructive
  endpoint added in v2.1 → v3.1 used `getConnectionForUser()` (which
  returns the conn for any member). A `viewer` could therefore
  quarantine, undo agent sessions, create / edit / delete custom
  actions and dashboard widgets, mutate Sentry findings, or run
  webhook actions. All of those are now gated behind
  `requireRole(..., "editor")`:
    - `POST /sentry/findings/[id]/quarantine` + `DELETE` (lift)
    - `PATCH /sentry/findings/[id]`
    - `POST /sessions/[id]/undo`
    - `POST / PUT / DELETE /actions` + `actions/[id]`
    - `POST /actions/[id]/execute`
    - `POST / PUT / DELETE /widgets` + `widgets/[id]`
  GET endpoints stay open to viewers as before, read access for
  support people is the whole point of the team feature.
- **[HIGH] Webhook SSRF blocklist gaps in custom actions**: extended
  the URL validator in `src/server/actions/repo.ts` to also reject
  IPv6 loopback (`::1`, `::`, `::ffff:127.*`), IPv4-mapped IPv6,
  link-local IPv6 (`fe80:`), private IPv6 (`fc00:`, `fd00:`),
  `metadata.google.internal`, `metadata.azure.com`, and `instance-data`
  cloud-metadata hostnames. (`169.254.169.254` was already covered by
  the existing `169.254.` prefix but is now also listed explicitly.)
- **[HIGH] Undo engine: null byte handling + comment**: PG can't store
  U+0000 in text columns. `jsonValueToSqlLiteral()` now strips null
  bytes from string values before quoting. Added a docstring covering
  what's safe and where (jsonb fallback, no-escape semantics under
  `standard_conforming_strings`).
- **[LOW] Quarantine policy name collisions**: previously truncated
  the finding UUID to 18 chars when building the policy name, which
  invites birthday-paradox collisions on large connections. Now uses
  the full 36-char UUID, fits comfortably in Postgres's 63-byte
  identifier limit.

Deferred to a later patch: race in `attachToSession()` SELECT-then-
INSERT can produce duplicate active sessions for one logical agent
burst. Documented in the source; needs a unique partial index to fix
properly. DNS-rebinding defence for webhook actions also out of
scope here, requires hostname resolution + IP-level checks.

## v3.1.0 · 2026-05-15 · Agent sessions + one-click undo

Tag: `v3.1.0` · Spec: [`031`](specs/031-agent-sessions/)

Second half of Agent Sentry. v3.0 caught RLS drift; v3.1 catches the
PocketOS / Replit-Agent class of incident: an AI agent doing a bulk
mutation you didn't intend.

- **Agent fingerprinter**: identifies Cursor, Claude Code, Replit
  Agent, Lovable, v0, Vercel AI SDK, and Suparbase's own OpenRouter
  calls from the request User-Agent. Falls through to `ai_unknown` /
  `browser` / `cli` for everything else.
- **Session bucketing**: every authenticated write through the proxy
  is grouped into an `agent_session` row via a 5-minute rolling
  window per (user, connection, agent_kind). Existing audit-log
  semantics preserved; bucketing runs in parallel with audit
  extraction and never blocks the response.
- **One-click session undo**: walks every `audit_log` row linked to
  the session, builds reverse SQL (INSERT→DELETE, DELETE→INSERT
  beforeRow, UPDATE→UPDATE back to beforeRow), and runs every
  reversal in a single transaction via the existing executeSql path.
  Bypasses RLS via the Direct Postgres URL (explicit admin op).
- **New `/c/[id]/agents` page** in the sidebar between Actions and
  Sentry. Sessions grouped by agent kind; click any session for a
  drawer showing the mutation list, raw User-Agent, and the Undo
  button. Status badges (active / closed / undone / undo_partial /
  undo_failed) tell you where each session sits.

Schema (drizzle 0010):
- `agent_session` (15 cols, indexed by user+conn+lastSeenAt and by
  user+conn+kind+status)
- `audit_log.session_id` (nullable; pre-existing rows stay null)

API:
- `GET /api/connections/[id]/sessions` → list + canUndo
- `GET /api/connections/[id]/sessions/[sessionId]` → detail + writes
- `POST /api/connections/[id]/sessions/[sessionId]/undo` → reverse

DDL capture (schema changes) and per-write diff preview are deferred
to v3.1.x.

## v3.0.0 · 2026-05-15 · Agent Sentry, security watchdog

Tag: `v3.0.0` · Spec: [`030`](specs/030-agent-sentry/)

The first half of a feature nothing else in market has: a continuous
security watchdog for vibe-coded Supabase projects, designed around
the 2026 incident pattern (Moltbook, Lovable CVE-2025-48757, PocketOS).

- **Two-channel probe**: anon REST probe fires `GET /rest/v1/<table>`
  per public-schema user table to detect anon-readable tables, plus
  `pg_policies` + `pg_class.relrowsecurity` inspection through the
  direct Postgres URL to catch RLS-disabled tables and overly-
  permissive `USING (true)` policies.
- **PII heuristic**: every anon-readable table is column-name matched
  against patterns for password / secret / api_key / refresh_token
  / ssn / credit_card / phone / email / address / dob / passport;
  matches are escalated from `warn` to `critical`.
- **One-click quarantine**: per finding, apply a temporary
  `CREATE POLICY suparbase_sentry_<id> ... USING (false)` to deny
  anon + authenticated access while you fix the root cause. Lifting
  the quarantine drops the policy cleanly.
- **New `/c/[id]/sentry` page** with severity-counter hero, open-
  findings list, archived section, and scan history. Auto-refreshes
  every 30s.

Schema: `sentry_scan` + `sentry_finding` (drizzle migration 0009).
API: `GET / POST /api/connections/[id]/sentry`, scan + ack + resolve
+ quarantine + dismiss endpoints, rate-limited on the AI bucket.

What's deferred to v3.0.x: scheduled scans (currently on-demand
only), finding deduplication across scans, public-bucket probe,
email alerts on critical findings. **v3.1** ships the AI-seatbelt
half: per-agent session attribution + one-click session undo for
PocketOS-style incidents.

## v2.4.1 · 2026-05-15 · Resend transactional email

Tag: `v2.4.1` · Spec: [`029`](specs/029-resend-email/)

Closes v2.4's email gap. Team invitations now get emailed directly
via Resend when configured, and gracefully fall back to copy-link
when not, no breakage either way.

- New `src/server/email/resend.ts`: reusable `sendEmail()` wrapper
  returning `{ delivered, reason, error }` so callers can branch on
  the "not configured" path inline. `getEmailConfig()` exposes the
  env state for UI.
- New `src/server/email/templates/invitation.ts`: HTML + plain-text
  invitation template, table layout for cross-client rendering,
  hairline visual language matching the rest of the product.
- `POST /api/connections/[id]/members/invitations` now sends an
  email if Resend is configured and returns a `delivery` field on
  the response.
- New `POST /api/connections/[id]/members/invitations/[invId]/resend`
  for retrying a delivery.
- New `GET /api/email/status` (auth-gated) so the UI can show the
  right copy.
- Invite dialog adapts: "we'll email it from <sender>" when
  configured, "share this copy-link" otherwise. Pending invitations
  list gains a Resend button when email is wired. Share-link
  dialog re-titles based on delivery state.
- `.env.example` + `docker-compose.yaml` document `RESEND_API_KEY`,
  `EMAIL_FROM`, `EMAIL_REPLY_TO`.

## v2.4.0 · 2026-05-15 · Team workspace (multi-user connections)

Tag: `v2.4.0` · Spec: [`028`](specs/028-team-workspace/)

Fourth and final release in the "we'll just build our own panel"
push. Suparbase is no longer a single-user app: owners can invite
teammates and pick a role.

- **`connection_member` + `connection_invitation` tables** (drizzle
  migration 0008). Owner stays implicit via `connections.user_id`;
  members are stored with `role: 'editor' | 'viewer'`.
- **Access model**: `getConnectionForUser()` now returns the
  connection if the caller is the owner OR any member, so every
  existing protected route just works for invited teammates.
  `listConnections()` returns owned + member-of connections with a
  `myRole` tag. A new `requireRole()` helper gates owner-only
  routes (rename / delete connection, member management, invite
  CRUD). Per-route viewer-vs-editor write enforcement on the proxy
  is deferred to v2.4.x.
- **Invite-by-link** (no email infra yet): owner generates a
  7-day-expiry token and copies the URL. Invitee clicks the URL
  → if their session email matches, accepts and joins. Mismatched
  or expired tokens get clear error states.
- **UI**: new "Team" section on `/c/[id]/settings` showing the
  member roster (with avatar, role select, remove) and pending
  invitations (revoke + "Get link"). Connection cards in the list
  show the caller's role tag (editor/viewer) and hide the
  rename/delete dropdown actions for non-owners. New
  `/invitations/[token]` accept page with redirect-to-signin flow.

API:
- `GET /api/connections/[id]/members` (any access)
- `POST /api/connections/[id]/members/invitations` (owner)
- `DELETE /api/connections/[id]/members/invitations/[invId]` (owner)
- `PATCH / DELETE /api/connections/[id]/members/[memberId]` (owner)
- `POST /api/invitations/[token]/accept`

## v2.3.0 · 2026-05-15 · Customer impersonation + session inspector

Tag: `v2.3.0` · Spec: [`027`](specs/027-impersonation/)

Third of four releases closing the "we'll just build our own panel"
gap. v2.3 gives support engineers a full per-user view without
leaving Suparbase.

- **User detail page** at `/c/[id]/auth-users/[uid]`: profile card
  (id, email + verification state, providers, banned status, both
  metadata blobs), quick actions (Send recovery, Revoke sessions,
  Delete user), and a hero strip linking to the user list.
- **Active sessions inspector**: reads `auth.sessions` directly via
  `executeSql()`, lists user-agent, IP, MFA factor, created /
  refreshed / expiry timestamps. Per-session revoke + revoke-all.
- **Related-records discovery**: scans the introspected schema for
  tables with a `user_id` / `owner_id` / `created_by` (or similar)
  uuid column, runs a single UNION-ALL count query, shows a card
  per matching table with a "view" link that opens the table page
  filtered to the user. The "view as user" without changing JWT.

New API routes:
- `GET / DELETE /api/v/[id]/auth-users/[uid]/sessions`
- `DELETE /api/v/[id]/auth-users/[uid]/sessions/[sessionId]`
- `GET /api/v/[id]/auth-users/[uid]/related`

All session and admin operations still require service_role (same
contract as v1.3 auth-users).

## v2.2.0 · 2026-05-15 · Dashboards

Tag: `v2.2.0` · Spec: [`026`](specs/026-dashboards/)

The second of four releases (v2.1 → v2.4) closing the "we'll just
build our own admin panel" gap. v2.2 turns the connection home into a
real dashboard.

- **Widget registry**: per-connection `dashboard_widget` table holding
  saved SQL queries plus a visualisation hint (kpi / bar / line /
  list), span (1 / 2 / full column), optional auto-refresh, and a
  free-form `vis_config`. Up to 24 widgets per connection.
- **Widget grid on the connection dashboard**: hand-written SVG
  charts so we don't ship a chart library. KPI tiles autoformat
  (number / currency / percent), pick up a `previous` column for
  delta hints. Bar charts render top-N rows, line charts a small
  area+line over time, lists a tiny table with chosen columns.
- **Editor at `/c/[id]/dashboard/edit`**: list / create / edit /
  delete widgets with a type-aware form (KPI gets format + unit +
  prefix; bar / line get label + value column; list gets column
  picker; refresh-interval for all).
- **Execution**: every widget runs through `executeSql()` with
  `readOnly: true`, a 5s statement timeout, and the same row/cell
  caps as the SQL playground. Rate-limited.

Widgets are wired into the existing connection dashboard above the
table-archetype groups, so the new home page is "metrics + tables"
instead of just tables.

## v2.1.0 · 2026-05-15 · Custom actions

Tag: `v2.1.0` · Spec: [`025`](specs/025-custom-actions/)

The first of four releases (v2.1 → v2.4) aimed at closing the
"we'll just build our own admin panel" gap. v2.1 lets ops teams
define declarative buttons backed by SQL templates or webhooks.

- **Action registry**: per-connection storage of named actions with
  scope (global / table / row), kind (sql / webhook), params, and a
  danger flag. CRUD via `/api/connections/[id]/actions` and a new
  `/c/[id]/actions` management page.
- **Action surfaces**: button strip rendered on the connection
  dashboard (global actions), in table headers (table-scoped), and on
  row detail pages (row-scoped, primary key auto-bound).
- **Safety**: SQL templates run through the existing `executeSql()`
  with parametrised `$1..$N` binding (no string concatenation),
  optional READ ONLY transaction, and the same row + char caps as
  the SQL playground. Webhooks reject private-network targets to
  block SSRF and time out after 15s with a 64KB body cap. Danger
  actions require typed-name confirmation. All executions are
  rate-limited.
- **Param form**: each action's params become a small dialog at run
  time, with type-aware inputs (string / number / boolean / json) and
  a results card showing rows + timing (SQL) or status + body
  (webhook).

Sidebar gains an "Actions" entry; the sidebar version display now
reads from `SITE.version` instead of the hardcoded `v1.0`.

## v2.0.0 · 2026-05-14 · AI chat overhaul

Tag: `v2.0.0` · Spec: [`024`](specs/024-ai-chat-v2/)

The AI chat went from a one-shot drawer to something you keep coming
back to. Five upgrades, all additive.

- **Persistent conversations**: per-connection localStorage holds up to
  50 conversations with a left sidebar to switch / delete / export
  each one. Titles are auto-derived from the first user message; the
  header shows cumulative tokens for the active chat.
- **Three new agent tools**: `aggregate` (count/sum/avg/min/max, with
  optional `group_by`), `list_indexes` (read indexes from `pg_indexes`
  to answer perf questions), and `audit_summary` (read the audit log
  scoped to the current user + connection). All read-only, dispatched
  through the same validated path as the v1 tools.
- **Page-context awareness**: when you're viewing `/c/<id>/tables/<x>`
  the chat sends `{ pathname, tableName, view }` to the agent so "this
  table" resolves correctly. Starter prompts adapt accordingly.
- **Markdown answers**: assistant messages render `**bold**`, inline
  `` `code` ``, `[links](href)`, bullet lists, and ```fenced code```
  blocks (with a copy button). Hand-written renderer, no extra deps.
- **Copy + export**: each assistant message gets a copy button on
  hover; each conversation can be exported as a self-contained
  markdown file.

Write proposals still require explicit Apply, the read-only-by-default
contract is unchanged.

## v1.6.0 · 2026-05-14 · Content expansion

Tag: `v1.6.0` · Spec: [`020`](specs/020-content-expansion/)

A content-heavy release that doubles the article library and adds a
new comparison surface for high-intent search.

- **Eight new articles**: which database for vibe-coding in 2026,
  MongoDB vs Postgres in 2026, the best AI-friendly database, vector
  databases ranked (pgvector / Pinecone / Qdrant / Weaviate /
  LanceDB / Chroma / Milvus), SQLite at the edge in 2026 (Turso /
  libSQL / D1), vibe-coding database patterns (10 that survive
  AI-paired work), why Supabase is the AI agent's favourite Postgres,
  and edge databases compared (Turso vs Neon vs D1). Each article
  follows the v1.5 shape: server component, typed meta, structured
  TOC, related-articles footer, internal links to product features
  where natural.
- **Three head-to-head comparison pages** at `/compare/<slug>`:
  Supabase vs Firebase, Postgres vs MongoDB, Supabase vs Neon. Each
  has a TL;DR card, "winner for X" callouts, a feature matrix table,
  an honest "when each one wins" section, and a closing take.
- **`/compare` hub** page that surfaces all comparisons in a two-
  column card grid.
- **Sitemap, footer, and JSON-LD** updated for the new routes. The
  Resources footer column gains a Compare link.

## v1.5.0 · 2026-05-14 · Content + SEO release

Tag: `v1.5.0` · Spec: [`019`](specs/019-seo-content/)

A content-driven release that gives Suparbase a real publishing
surface and the SEO infrastructure to make it discoverable.

- **Eight long-form technical articles** on trending 2026 topics:
  Row-Level Security in Postgres, Supabase vs self-hosted, building
  multi-tenant SaaS on Postgres, pgvector for RAG in production,
  zero-downtime Postgres migrations, the AI-assisted database admin,
  JSONB vs tables, and connection pooling for modern Postgres. Each
  one is a server React component (no MDX runtime) with structured
  TOC, callouts, code blocks, and inline links to the relevant
  Suparbase features.
- **Three use-case landing pages**: SaaS founders, agencies managing
  many client projects, and ops/support/product teams building
  internal tools. Each one walks through the day-to-day flows we see
  in real customer interviews.
- **SEO infrastructure**: dynamic `sitemap.xml` covering every
  public route plus all articles and use cases, `robots.txt` allowing
  public pages and disallowing the authenticated app, per-route
  metadata with canonical URLs and Open Graph + Twitter cards, and
  JSON-LD structured data (`TechArticle`, `WebSite`,
  `BreadcrumbList`) emitted on every page.
- **Article system**: `ArticleLayout` with a sticky table of contents
  generated from each article's `toc` array, related-articles footer
  that respects the article's `related` slugs, and a CTA card linking
  back to the product. `CodeBlock` and `Callout` primitives for
  article content.
- **PublicNav and PublicFooter** gained `Blog` and `Use cases` entries.

## v1.4.0 · 2026-05-14 · SQL playground

Tag: `v1.4.0` · Spec: [`018`](specs/018-sql-playground/)

- **SQL playground.** New `/c/[id]/sql` workspace page that runs raw
  SQL against the user's project via the existing direct-Postgres URL
  (the encrypted column introduced for the RLS debugger). Read-only by
  default: the server wraps every query in
  `BEGIN; SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = N;
  <sql>; ROLLBACK` so Postgres itself rejects writes (error code
  25006) and the rollback is belt-and-braces. Write mode is a separate
  toggle behind a `window.confirm`; write-mode queries burn the same
  rate-limit bucket as PostgREST writes and record an `audit_log`
  entry with the SQL text stored in `afterRow.sql` so the row history
  panel and recent-activity feed both surface it. UI: textarea editor
  (`Cmd/Ctrl+Enter` to run, `Tab` inserts spaces), statement-timeout
  selector (1–60s), EXPLAIN button, sticky-header results table with
  column name + Postgres type, NULL/boolean/long-string treatments,
  and a Recent dropdown reading the last 30 queries from
  `localStorage`. Postgres error codes are mapped to friendly
  categories (read-only violation, statement timeout, RLS violation,
  syntax error) and rendered with `detail` + `hint` + `position` from
  the upstream response.

## v1.3.0 · 2026-05-14 · Storage + Auth users

Tag: `v1.3.0` · Specs: [`016`](specs/016-storage-browser/), [`017`](specs/017-auth-users/)

Two big surface-area additions that close the most-asked gaps in v1.2:

- **Storage browser.** New `Storage` workspace page that talks to
  Supabase's `/storage/v1/*` API with the same encrypted connection
  key used for PostgREST. Bucket list on the left, object browser on
  the right with prefix breadcrumbs and drag-drop upload. Multi-file
  upload with `upsert: true`, multi-select bulk delete, per-file
  Sign button that copies a 1h signed URL, and a Copy button on
  public buckets for the constructed public URL. Create + cascade-
  delete buckets from the UI (delete uses the `empty=1` endpoint to
  wipe contents first). Uploads are capped at 50 MB and burn write-
  rate tokens from the same bucket as PostgREST writes.
- **Auth users page.** New `Auth users` workspace page that wraps the
  Supabase Admin API (`/auth/v1/admin/*` and `/auth/v1/invite`). List
  with pagination, client-side filter, and a detail pane showing the
  full timeline + providers + metadata + status. Actions: invite a
  new user, generate a recovery link (copied to clipboard), ban or
  unban (1-year `ban_duration`), and delete. Every helper enforces
  `requireServiceRole(conn)` server-side; when the connection's
  stored key is anon/authenticated, the page renders a clear
  "service_role key required" banner with a link to the connection
  settings instead of failing with an opaque 403.

## v1.2.0 · 2026-05-14 · Power-user release

Tag: `v1.2.0` · Specs: [`011`](specs/011-inline-cell-editing/), [`012`](specs/012-global-row-search/), [`013`](specs/013-row-history/), [`014`](specs/014-ai-write-actions/), [`015`](specs/015-rls-debugger/)

Five distinct features landed together: each was reviewed, built, and
shipped as its own commit so any one of them can be reverted without
disturbing the others.

- **Inline cell editing.** Click any editable value on a row detail
  page to edit it in place. Enter / Tab / blur commit; Escape cancels;
  optimistic UI with toast feedback. Works across all seven archetype
  detail pages via a new shared `EditableField` component. JSON, FK,
  generated, PK columns, and view tables stay read-only. (specs/011)
- **Global row search (Cmd-K).** The command palette now scans every
  public-schema table in parallel for any 2+ character query. String
  columns match via ilike, uuid columns via eq when the term looks like
  a uuid, integer columns via eq when it parses as a number. Each hit
  links straight to the row detail page. New
  `POST /api/v/[id]/search` endpoint, max 5 hits per table, 30 hits
  total. (specs/012)
- **Row history panel.** `audit_log` gained `before_row` / `after_row`
  jsonb columns (migration `0004`). The proxy now captures snapshots
  from `Prefer: return=representation` responses for insert/update, and
  the delete client helper was updated to request representation too so
  the deleted row is captured. A new `RowHistoryPanel` sits in the
  right rail of every detail page; entries expand to show a column-by-
  column `from → to` diff. (specs/013)
- **AI write actions with a confirm-then-execute diff card.** Three new
  agent tools: `propose_update`, `propose_insert`, and `propose_delete`
  let the chat assistant draft writes without executing them. Each
  proposal carries a preview of up to 5 affected rows. The UI renders a
  colored diff card; Apply hits `POST /api/ai/chat/[id]/execute`, which
  re-validates the proposal server-side and writes audit_log diffs the
  history panel picks up immediately. Reads stay independent: the AI
  has no direct INSERT/PATCH/DELETE tool. (specs/014)
- **RLS policy debugger.** A new workspace page lists every
  `pg_policies` entry, shows which tables actually have RLS enabled,
  and simulates SELECT/INSERT/UPDATE/DELETE inside a rolled-back
  transaction with the role + `request.jwt.claims` of your choice.
  Because `pg_policies` isn't exposed through PostgREST with anon /
  authenticated keys, this introduces an optional second credential:
  the connections table gained an encrypted `postgres_url` column
  (migration `0005`), and the RLS page prompts to add one before any
  catalog query runs. The URL is never echoed back over the wire :
  only `hasPostgresUrl: boolean`. (specs/015)

## v1.1.0 · 2026-05-14 · More archetypes

Tag: `v1.1.0` · Spec: [`specs/010-more-archetypes/`](specs/010-more-archetypes/)

The archetype system was deliberately narrow in v1.0: Users, Content, Logs,
and a Generic fallback. v1.1 widens the taxonomy without changing the
mechanism: three new categories, each with a dedicated list + detail view,
each automatically applied to any matching table from the AI analysis (or
heuristic fallback): no per-schema configuration required.

- **Commerce archetype.** Orders, invoices, transactions, payments,
  charges, receipts, carts, checkouts. List view (`CommerceAdmin`)
  surfaces order number + customer + status pill + money column at the
  end of the row, with an on-page revenue tally in the stat strip.
  Detail view (`CommerceDetail`) renders the total at display size in a
  hero card alongside a four-step pipeline (Placed → Paid → Shipped →
  Delivered) driven from the canonical status vocabulary; terminal
  states (refunded / cancelled / failed) collapse the pipeline to a
  single note. Money columns are formatted via `Intl.NumberFormat` with
  the table's `currency` column when present; `_cents` columns divide
  by 100 automatically.
- **Tasks archetype.** Tickets, issues, todos, cards, jobs, reminders.
  List view (`TasksAdmin`) groups rows by canonical status bucket
  (To do / In progress / Done / Blocked / Other) collapsing synonyms
  like `in_progress` / `doing` / `active` / `started` / `review` into a
  single column; each row shows title + assignee + priority + due date
  with overdue surfaced in red on the detail page. Detail view
  (`TaskDetail`) renders the title with bucket icon, status pill,
  priority chip, assignee (linkable when the FK is set), and a body
  block from `description` / `details` / `notes`.
- **Messages archetype.** Comments, threads, conversations, replies,
  notes. List view (`MessagesAdmin`) renders each row as a compact chat
  card with author + body snippet + reply badge (when a thread/parent FK
  is set), with on-page reply count + unique author count in the stat
  strip. Detail view (`MessageDetail`) is a single chat bubble with
  author link (when the FK is set) + relative time + "in reply to"
  pointer when applicable.
- **Classifier extensions.** `TableCategory` enum widened to seven
  values; OpenRouter prompt + Zod response schema both teach the model
  the new categories with concrete signals (money + status →
  `commerce`; status + assignee FK → `tasks`; body + author FK +
  thread FK + no slug → `messages`). Heuristic fallback updated to
  match the same shapes so first paint never waits on the model.
- **Workspace surfaces.** `TableTile`, `CommandPalette`, and
  `PresetSwitcher` all carry icons + labels for the three new
  categories. `groupTablesByArchetype` emits the new buckets so the
  Tables page renders them as their own sections ("Commerce",
  "Workflow", "Conversations") under the existing disclosure pattern.
- No new dependencies. Bundle: largest authenticated route
  (`/c/[id]/tables/[name]/new`) stays at 186 KB First Load JS: well
  under the 520 KB gz budget. Typecheck + `next build` both green.

## v1.0.1 · 2026-05-14 · Landing polish

Tag: `v1.0.1`

A focused polish pass on the unauthenticated landing page. Everything in
v1.0.0 unchanged; this is `/` only.

- **Hero animation rewrite.** Word-by-word mask-reveal on the headline
  (proper translate-from-below clip, not just opacity fade). Each word
  starts at `yPercent: 115` and rises into its `overflow-hidden` mask
  with `power4.out` easing + stagger; the accent line ("Supabase
  project.") is followed by a terminal caret that blinks: visual cue
  that this is software, not a brochure.
- **Product preview cards** dealt in below the CTAs with a `back.out`
  ease + slight rotation that settles. The three cards mirror the
  actual archetypes from the product (Users / Content / Logs) so the
  user sees exactly what they'll get the moment they sign in: bridges
  marketing → product without screenshots. Each carries one subtle
  live signal: the Users status pulses; the Logs timestamp ticks
  "12s → 13s → … → 59s → 12s" in real time. Both honour
  `prefers-reduced-motion`.
- **Surrounding layout.** Replaced the forbidden "three-card hero
  grid" (Constitution Principle III) with a numbered vertical list
  paired with a sticky-feeling headline column. The "Why server-side"
  block becomes a single surface card with five concrete promises and
  a Try-it / Self-host CTA pair. Header gains a GitHub link; footer
  shows `v1.0`.
- No new dependencies. Landing bundle: 135 KB → 144 KB First Load JS
  (+9 KB), entirely from the new product preview cards. Well under
  the 520 KB gz budget.

## v1.0.0 · 2026-05-14 · Polished release

Tag: `v1.0.0` · Spec: [`specs/008-v1-polish/`](specs/008-v1-polish/)

The GA release. Closes the remaining v0.7 backlog (saved views, filter
chips), pulls the v0.6 visual language down to every previously
unpolished surface, and unifies typography into a single professional
sans-serif family.

- Constitution **v3.2.0 → v3.3.0**: Principle III (Anti-AI-Slop Design)
  expanded to codify the v1.0 typography baseline: unified Inter
  Variable for body + display with heavier weight + tighter tracking on
  the display utility. No NON-NEGOTIABLE relaxed.
- **Typography unified**. Dropped Fraunces (serif) entirely; the
  `font-display` utility now resolves to Inter Variable at 650–700
  weight with tighter tracking. One font family across the entire app
  except JetBrains Mono for code/IDs. One fewer font family loaded at
  first paint.
- **Generic admin lift**. `TableListView` rebuilt: PageHeader chrome,
  stat tiles, row cards (not HTML `<table>`), BulkBar + ExportMenu +
  ImportPanel mounted, click-row → detail page (no drawer). New
  `GenericDetail.tsx` mirrors UserDetail's hero + sectioned identity +
  Linked-records sidebar for every non-archetype row. The old
  `TableRowView`, `DataGrid`, `DataGridToolbar`, and `RowDrawer`
  components are deleted: every list/detail page now uses the same
  visual language regardless of archetype.
- **Schema view rebuild**. The `/c/[id]/schema` page now uses
  `PageHeader` chrome, archetype groupings (People / Library /
  Activity / Everything else) via the existing `groupTablesByArchetype`
  helper, expandable `<details>` per table revealing columns grouped
  into Identifiers / Fields / Metadata, FK chips that link to the
  referenced table, and a System tables disclosure.
- **Connection flows polish**. `ConnectionList` cards redesigned:
  database icon, role chip, last-used relative time, hover-revealed
  action menu, whole-card click navigates to the workspace. The
  new-connection page wraps `ConnectionForm` in `PageHeader` with a
  "Paste from Supabase dashboard" eyebrow. `ConnectionSettings`
  reorganized into Identity / Security / Danger Zone surface cards.
- **Saved views (US5 from v0.7)**. New `saved_views` migration shipped
  in v0.7 MVP is now wired end-to-end: `GET / POST / PATCH / DELETE
  /api/views` routes, `useSavedViews` / `useCreateView` / `useUpdateView`
  / `useDeleteView` hooks, and a `ViewTabs` component mounted in
  `PageHeader`'s tabs slot on every list page. Views capture the
  current search + filter + sort and apply via a single URL push.
  Capped at 5 custom views per (user, connection, table).
- **Filter chips (US6 from v0.7)**. New `FilterBar` + `FilterPopover`
  + `FilterChip` components. Click "+ Filter" → pick column → pick
  operator → enter value → chip appears. Multiple chips combine with
  AND. Removing a chip narrows the URL. Operators are type-aware via
  `OPERATORS_FOR_TYPE`. The URL is the canonical state; `listRows` now
  accepts `filters?: ChipSpec[]` and translates them to PostgREST
  filter params under the existing proxy.
- **Settings + new-row + sign-in/up** previously partially polished now
  also use `PageHeader` chrome end-to-end.
- **v0.7 backlog status**: US5 (saved views) ✓ shipped. US6 (filter
  chips) ✓ shipped. **US4 (inline cell editing) deferred to v1.1** :
  the existing click-row → detail page → Edit flow still covers the
  use case; inline editing requires invasive changes to row-card
  layouts that would extend this release beyond its scope.
- Removed `@fontsource-variable/fraunces` dependency.
- Removed dead files: `src/components/workspace/TableRowView.tsx`,
  `src/components/data/DataGrid.tsx`,
  `src/components/data/DataGridToolbar.tsx`,
  `src/components/row/RowDrawer.tsx`, and the orphan
  `src/index.css` (vestigial from the v0.1 Vite SPA era).

## v0.6.0 · 2026-05-13 · Product workspace

Tag: `v0.6.0` · Spec: [`specs/006-product-workspace/`](specs/006-product-workspace/)

A coherent visual + UX overhaul: every workspace surface now matches the
Users archetype shipped in v0.5.1. The app reads as a product, not a
database admin. No schema changes; no new dependencies.

- **Dashboard rewrite** ([src/components/workspace/Dashboard.tsx](src/components/workspace/Dashboard.tsx)).
  Title is the connection's friendly name; hostname is demoted to subtitle.
  Hero stat strip with archetype-derived tiles (Audience / Library /
  Activity / Other tables). Archetype-grouped table sections. A "Recent
  activity" sidebar reads from `audit_log` via a new authenticated route.
  System tables collapse behind a disclosure.
- **Tables list rewrite** ([TablesList.tsx](src/components/workspace/TablesList.tsx)).
  Archetype groups (People / Library / Activity / Everything else); a
  search input filters every section at once; system tables behind a
  disclosure; uses the same `PageHeader` chrome as every other page.
- **Content archetype rebuilt** ([ContentAdmin.tsx](src/components/presets/ContentAdmin.tsx),
  [ContentDetail.tsx](src/components/presets/ContentDetail.tsx)). CMS-style
  row cards (title / status pill / author / published-at). Click → real
  detail page with title hero, body rendered as wrapped readable text,
  and a Linked-records sidebar. Drawer-as-detail pattern removed.
- **Logs archetype rebuilt** ([LogsAdmin.tsx](src/components/presets/LogsAdmin.tsx),
  [LogDetail.tsx](src/components/presets/LogDetail.tsx)). Time-bucketed
  event stream (Today / Yesterday / This week / Earlier). jsonb payloads
  collapse to one-line previews, click-to-expand. Detail page leads with
  the timestamp and pretty-prints the payload.
- **Command palette** ([CommandPalette.tsx](src/components/workspace/CommandPalette.tsx)).
  Cmd/Ctrl+K from anywhere in the workspace. Indexes connections,
  tables (with AI display names), pages, settings, and global actions
  (Toggle theme, Run AI analysis, Sign out). Lazy-loads its index on
  first open: the dialog appears instantly. Built on the existing
  cmdk + Radix Dialog primitives, no new deps.
- **Theme toggle** ([ThemeToggle.tsx](src/components/workspace/ThemeToggle.tsx),
  [src/lib/theme/](src/lib/theme/)). Topbar button switches between
  light and dark; preference persists in a `suparbase-theme` cookie
  readable by the server in [`app/layout.tsx`](src/app/layout.tsx) so
  initial paint matches: no flash on reload. Defaults to OS
  `prefers-color-scheme` when no preference is set. Full WCAG-AA light
  palette added to [globals.css](src/app/globals.css).
- **Sidebar polish** ([Sidebar.tsx](src/components/workspace/Sidebar.tsx)).
  Inline counts on Tables and Schema, accent-tinted active state with a
  left-edge indicator, AI footer link shows last-used model + token
  total when an analysis is cached.
- **New API route**: `GET /api/v/[id]/audit/recent?limit=10`: reads
  the user's own recent writes for a single connection. Connection
  ownership verified before any DB read; rate-limited under a new
  `checkReadRate` bucket (240/min/user). Contract:
  [audit-recent.md](specs/006-product-workspace/contracts/audit-recent.md).
- **AI analysis extended in v0.5.1** (pulled into the v0.6 release):
  `TableAnalysis` now carries `primary { titleColumn, subtitleColumn,
  avatarColumn, badgeColumn }`, `hiddenColumns`, and `relations`. The
  AI prompt asks for these explicitly; heuristic fallback fills them
  too. Every preset in this release reads them.
- `RowPresetRouter` dispatches `users` → `UserDetail`, `content` →
  `ContentDetail`, `logs` → `LogDetail`; everything else falls through
  to the existing `TableRowView`. The drawer-as-detail pattern is gone
  from every archetype (the drawer module still exists for the generic
  grid fallback).
- Bundle measurement: largest authenticated first-paint payload is
  `/c/[id]/tables/[name]/[pk]` at 189 KB First Load JS: well under
  the Constitution's 520 KB gz budget.
- Deletes the now-unused `src/components/presets/shared/PresetHeader.tsx`
  in favour of the shared `PageHeader` (Principle VI: no abstraction
  without a second caller).
- Constitution **v3.2.0 unchanged**: no new principle needed.

## v0.5.0 · 2026-05-13 · Self-bootstrap & email/password auth

Tag: `v0.5.0` · Spec: [`specs/005-bootstrap-and-credentials/`](specs/005-bootstrap-and-credentials/)

- Constitution **v3.1.0 → v3.2.0**: Principle VII clarified :
  auto-generated vault keys are permitted iff they persist with the
  data they encrypt and the operator is warned via README.
- **Self-bootstrap secrets**: a one-shot `bootstrap` Alpine container
  writes `postgres_password`, `auth_secret`, and `encryption_key`
  into a shared Docker volume on first deploy. `db` reads its
  password via `POSTGRES_PASSWORD_FILE`; the app entrypoint reads
  each `*_FILE` into env. Coolify deploy now requires **zero** env
  vars (GitHub OAuth remains optional).
- **Email + password auth**: NextAuth's Credentials provider with
  bcryptjs (cost 12). New `/signup` page, new `/api/auth/signup`
  route (rate-limited 5/hour/IP), `password_hash` column on `users`.
- **GitHub OAuth becomes optional**: the provider is included only
  when both `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are set. The
  Sign-in/Sign-up pages conditionally render the GitHub button.
- Session strategy switched from `database` to `jwt` so Credentials
  composes with the Drizzle adapter.
- `AUTH_URL` default → `https://suparbase.com`.
- Redactor now strips bcrypt hashes (`$2a$`, `$2b$`, `$2y$`).
- New migration: `drizzle/0002_minor_magus.sql`.

## v0.4.0 · 2026-05-13 · Coolify deployment

Tag: `v0.4.0` · Spec: [`specs/004-deploy-coolify/`](specs/004-deploy-coolify/)

- Production `Dockerfile` (multi-stage, non-root, Next.js standalone output).
- `docker-compose.yaml` with two services: `supabase/postgres` for the
  app database, and the Next.js app. No host port binding: Coolify's
  Traefik proxy routes by domain.
- `scripts/migrate.mjs` runs Drizzle migrations at container start.
- Operator only sets six env vars in Coolify; three of them Coolify can
  generate (`POSTGRES_PASSWORD`, `AUTH_SECRET`, `SUPARBASE_ENCRYPTION_KEY`).
  `DATABASE_URL` is composed inside the compose file.
- Constitution v3.1.0 unchanged (no new principle needed for deploy).

## v0.3.0 · 2026-05-13 · AI-augmented admin presets

Tag: `v0.3.0` · Spec: [`specs/003-ai-augmented-admin/`](specs/003-ai-augmented-admin/)

- Constitution **v3.0.0 → v3.1.0**: added Principle IX (AI Assistance):
  opt-in, server-only, schema-only inputs, Zod-validated outputs,
  cached by fingerprint, graceful fallback.
- New `user_settings` table (encrypted OpenRouter key, default model,
  last-run token usage) and `schema_analysis` cache table.
- `src/server/ai/`: OpenRouter fetch wrapper with key probe, prompt
  builder, Zod schema validator, SHA-256 schema fingerprint,
  orchestrator with heuristic fallback.
- `/api/settings/ai` (GET/PUT/DELETE) and `/api/ai/analyze/[id]`
  (GET cached / POST run).
- Four lazy-loaded preset components: `UsersAdmin`, `ContentAdmin`,
  `LogsAdmin`, `GenericAdmin`. Each table routes to its preset; users
  can override per-session with `?view=generic`.
- Dashboard shows AI-derived category badge + display name.
- Redactor now strips `sk-or-…` / `sk-…` patterns in addition to JWTs.
- AI rate limit: 10 analyses / hour / user.

## v0.2.0 · 2026-05-13 · Authenticated SaaS

Tag: `v0.2.0` · Spec: [`specs/002-suparbase-saas/`](specs/002-suparbase-saas/)

- Constitution **v2.0.0 → v3.0.0**: Principle V replaced
  ("Client-Only SPA" → "Server-Side Vault & Proxy"); Principle VIII
  added (Account & Tenancy).
- Migrated from Vite SPA to **Next.js 15 (App Router)**.
- **NextAuth v5** with the Drizzle adapter and GitHub OAuth.
- **Drizzle ORM + PostgreSQL** schema for users / accounts / sessions /
  connections / audit_log.
- **AES-256-GCM credential vault** with versioned ciphertext (supports
  rotation via `SUPARBASE_ENCRYPTION_KEY_OLD`).
- **Server-side PostgREST proxy** at `/api/v/[id]/rest/[...path]` :
  the user's API key never reaches the browser. Streams responses,
  rate-limits writes, logs every write to an audit table.
- Replaced `supabase-js` (browser) with a small `pgrest()` fetch
  client targeting the proxy. Bundle dropped ~53 KB.
- HSTS / CSP / X-Content-Type-Options / Referrer-Policy /
  Permissions-Policy at the Next.js edge.

## v0.1.0 · 2026-05-13 · Client-only Vite SPA

Tag: `v0.1.0` · Spec: [`specs/001-supabase-admin/`](specs/001-supabase-admin/)

- Constitution **v1.0.0 → v2.0.0**: product redefined from a static
  marketing site to an interactive admin tool.
- Pure client-side React SPA (Vite + React 18 + TypeScript).
- Schema introspection via PostgREST's OpenAPI document.
- Per-table data grid with sort, search (server-side `ilike`),
  pagination, FK label resolution.
- Type-aware row form: text, textarea, number, switch, datetime,
  UUID with generator, JSON editor, enum select, FK reference picker.
- Delete with confirmation + 5-second undo via re-insert.
- Schema view and connection management.
- Mobile responsive nav.
- JWT role detection on connect; service-role key warning.
- Production-readiness pass: ErrorBoundary, mobile nav, boot-time
  credential health check, per-route titles, primary-key fallback for
  schemas without `<pk/>` tags.
- Constitution v1.0.0 initial: marketing-site stack (later supplanted
  by v2.0.0's app-stack rewrite).

---

## Conventions

- Each major version is a separate Spec-Kit feature directory at
  `specs/00N-<name>/` with `spec.md`, `plan.md`, optionally
  `research.md`, `data-model.md`, `contracts/`, `quickstart.md`,
  `tasks.md`, and `checklists/requirements.md`.
- Constitution amendments accompany every MAJOR/MINOR version bump and
  live at [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
- Tags `vN.M.0` mark the merged-to-main commit for each feature.
