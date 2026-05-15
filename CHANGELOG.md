# Changelog

All notable changes between Suparbase versions. Each version corresponds
to a Spec-Kit feature directory under [`specs/`](specs/) and a git tag.

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
table — the widget that ends up in `dashboard_widget` is identical
to one a human typed by hand.

## v3.1.5 · 2026-05-15 · Production hardening pass

Eight items closed, every gap from the production audit that's
fixable without a real Supabase project to validate against. The
remaining "actually run it" steps live in the new
[PRODUCTION.md](PRODUCTION.md).

**Session cache** — TTL dropped from 5 min to 60 s so cross-instance
staleness windows are bounded; hard `MAX_CACHE_ENTRIES = 2048` cap
with LRU eviction on insert; `touchLru` on read.

**Rate limits everywhere destructive** — new
`src/server/security/route-guards.ts` with `limitOr429()`. Applied
to action create / update / delete, widget create / update / delete,
sentry finding mutate, quarantine apply + dismiss, member mutate +
remove, invitation create + revoke. Undo session uses the AI bucket.

**Audit retention** — new `src/server/audit/retention.ts` prunes
audit_log / sentry_scan / resolved sentry_findings / closed
agent_sessions on configurable windows. New `/api/cron/retention`
route gated by `CRON_SECRET` Bearer auth; fail-closed when secret
isn't set.

**Structured redacted logger** — new `src/server/log.ts` emits JSON
lines with `level / msg / ts / ctx`. Every value runs through the
existing `redact()` so JWTs and provider tokens never reach the log
stream. Levels honour `LOG_LEVEL` env. Sentry / Logflare / Datadog
plug-in is a five-line `emit()` swap.

**CSRF at the edge** — new `src/middleware.ts` rejects cross-origin
POST / PUT / PATCH / DELETE on `/api/**`, `/c/**`, `/connections/**`,
`/settings/**`. Exempts `/api/auth/*` so NextAuth callbacks pass.

**Test coverage** — 9 new undo-SQL tests covering timestamptz, uuid,
bigint as string, numeric with decimals, text[] / int[] through
jsonb cast, jsonb with nested objects, Infinity / NaN → NULL,
composite primary keys, identifier + value quoting combined.
**62 tests total, all passing.**

**PRODUCTION.md** — 90-minute end-to-end validation checklist for
the v3 surface, plus launch-day hardening, observability,
backups, multi-instance gotchas, and deferred caveats.

**README** — "public beta (v3.1.5)" status badge + honest paragraph
about what's tested vs. what isn't, linking PRODUCTION.md.

**.env.example** — documents `CRON_SECRET` and `LOG_LEVEL`.

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
