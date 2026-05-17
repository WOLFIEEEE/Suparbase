# Production checklist

Suparbase is feature-complete through v3.1 with substantial test coverage,
but the v3 feature surface (Agent Sentry, agent sessions, undo) has not
been driven end-to-end against a real Supabase project yet. This file is
the validation checklist anyone running it in production should walk
through before pointing it at real customer data.

## TL;DR

1. Deploy Suparbase per the README.
2. Walk through the **operational checks** below against a throw-away
   Supabase project. Roughly 90 minutes.
3. Move on to **launch-day hardening** once the validation passes.
4. Bookmark **observability** for the first time something breaks.

---

## 1. Validate against a real project (90 min)

Spin up an empty Supabase project (the free tier is fine). Pretend it
holds customer data:

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  amount numeric NOT NULL,
  tags text[] DEFAULT '{}',
  meta jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO users (email, password_hash) VALUES
  ('alice@example.com', 'h_abc'),
  ('bob@example.com', 'h_def');
INSERT INTO orders (user_id, amount, status)
SELECT id, 19.99, 'pending' FROM users LIMIT 1;
```

### 1.1 Sentry probe (no RLS, no Direct PG URL)

- [ ] Connect the project to Suparbase using its **anon** key.
- [ ] Open `/c/<id>/sentry`. Run a scan.
- [ ] Expect a `critical` finding on `public.users`
      (`anon_read_pii` because `password_hash` matches the heuristic).
- [ ] Expect a `warn` finding on `public.orders` (`anon_read`).
- [ ] Try Quarantine. Expect "Needs the Direct Postgres URL." Confirms
      the gate is correctly enforced.

### 1.2 Sentry probe (RLS enabled, Direct PG URL set)

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- Intentionally permissive. Sentry should still flag this.
CREATE POLICY "read all to authed" ON users FOR SELECT TO authenticated USING (true);
```

- [ ] Add the Direct Postgres URL to the connection settings.
- [ ] Re-run the Sentry scan.
- [ ] Expect a `warn` finding on `users` for `policy_overly_permissive`.
- [ ] Click **Quarantine**. Confirm the policy
      `suparbase_sentry_<uuid>` is created against `users`.
- [ ] Try to read users via anon REST: expect 200 with `[]` (RLS
      now denies everything).
- [ ] Click **Lift quarantine**. Confirm the policy is dropped and
      anon reads return rows again (per the permissive policy).

### 1.3 Agent attribution + undo

- [ ] From a `curl` with `User-Agent: Cursor/0.45.0`, POST a write
      against `/api/v/<id>/orders` (Suparbase's PostgREST proxy).
      Repeat 3-4 times: one INSERT, two UPDATEs, one DELETE.
- [ ] Open `/c/<id>/agents`. Confirm a single `Cursor 0.45.0` session
      with all the writes attributed to it.
- [ ] Click into the session, then **Undo session**.
- [ ] Verify the table state matches the original - INSERTs gone,
      UPDATEs reverted, DELETEs restored.
- [ ] Re-check `agent_session.status` is now `undone` and the local
      session cache evicted (subsequent writes open a fresh session).

### 1.4 Column-type coverage for undo

Repeat 1.3 against tables with each type at least once:

- [ ] `timestamptz` column
- [ ] `uuid` column
- [ ] `jsonb` column with nested objects
- [ ] `text[]` and `int[]` arrays
- [ ] `numeric` column with scale > 0 (e.g. `12.99`)
- [ ] Composite primary key

For each, confirm undo reverts cleanly. Tests pin the SQL shape; this
verifies Postgres actually accepts it on the way back.

### 1.5 Team workspace + invites

- [ ] Owner invites a teammate by email. Confirm invitation URL works.
- [ ] If `RESEND_API_KEY` + `EMAIL_FROM` are set: confirm a real email
      arrives in Gmail / Outlook / Apple Mail. Check spam, check the
      "From" address matches `EMAIL_FROM`.
- [ ] Teammate accepts. Verify `connection_member` row exists.
- [ ] As a `viewer`, try to call any destructive endpoint
      (quarantine, undo, action execute, widget create). Expect 403.

### 1.6 Custom actions

- [ ] Define a SQL action with a parameter:
      `UPDATE orders SET status = $1 WHERE id = $2::uuid`
- [ ] Run it from the row detail page. Confirm the change.
- [ ] Define a webhook action targeting `https://httpbin.org/post`.
      Confirm the request lands; confirm webhook headers + body
      are correct on the receiving side.
- [ ] Try a webhook URL pointing at `http://169.254.169.254/`. Expect
      validation rejection at action save time.

### 1.7 Dashboards

- [ ] Create a KPI widget: `SELECT count(*) AS value FROM orders`.
      Confirm it renders.
- [ ] Create a bar chart widget. Confirm the chart shape.
- [ ] Edit, save, delete. Verify the widget grid updates.

### 1.8 AI chat (skip if no OpenRouter key)

- [ ] Configure an OpenRouter key in `/settings/ai`.
- [ ] Open the AI chat. Ask "how many orders are pending?".
- [ ] Confirm the agent runs `list_tables` → `get_table_schema` →
      `count_rows` and answers with the right number.
- [ ] Ask it to mark all pending orders as cancelled. Expect a
      diff card before any write. Approve. Verify.
- [ ] Verify the write appears in `/c/<id>/agents` as an
      `openrouter` session.

---

## 2. Launch-day hardening

Items in this section don't need a real project - they're code/config
checks before going live.

### 2.1 Environment

- [ ] `AUTH_SECRET` is a 32-byte random secret, set per-deployment.
- [ ] `SUPARBASE_ENCRYPTION_KEY` is a 32-byte base64-encoded secret,
      **backed up out-of-band** (losing it makes every stored
      Supabase credential unrecoverable).
- [ ] `NEXT_PUBLIC_SITE_URL` points to the real canonical URL.
- [ ] `CRON_SECRET` is set if you want retention to run (see 2.3).
- [ ] `RESEND_API_KEY` + `EMAIL_FROM` are set if you want invite
      emails (optional, fallback works fine without).
- [ ] If self-hosting on Coolify: snapshot the `suparbase_secrets`
      Docker volume immediately after first boot.

### 2.2 Auth

- [ ] Confirm `AUTH_URL` matches the host the user actually visits
      (mismatched values produce confusing CSRF rejections).
- [ ] If GitHub OAuth is enabled, the callback URL in the GitHub
      app settings exactly matches `${AUTH_URL}/api/auth/callback/github`.
- [ ] If GitHub OAuth is **not** enabled, the signup form falls back
      to email + password cleanly.

### 2.3 Retention

- [ ] Wire a daily cron call to `POST /api/cron/retention` with
      `Authorization: Bearer $CRON_SECRET`. Confirm it returns
      `{ auditRowsPruned, scansPruned, findingsPruned, sessionsPruned, durationMs }`.
- [ ] If you keep audit history longer than the defaults
      (90 / 30 / 60 / 90 days), pass a config to `runRetention()`
      via a custom cron route instead of using the default.

### 2.4 Rate limits

- [ ] Default limits live in `src/server/proxy/ratelimit.ts`.
      Defaults are: 60 writes/min, 240 reads/min, 5 bulk batches/min,
      10 AI calls/hour. Tune per your traffic.
- [ ] **Caveat:** the rate-limit map is in-memory and per-process.
      If you scale to multiple Next.js instances, the same user can
      effectively hit `(limit × instance_count)`. Upgrade to
      [Upstash Ratelimit](https://upstash.com/docs/oss/sdks/ts/ratelimit/overview)
      or similar when this matters.

### 2.5 CSRF

- [ ] CSRF protection is the `src/middleware.ts` Origin check.
      Verified to reject cross-site POSTs. Same-origin POSTs pass.
      Server-to-server / curl with no Origin header is allowed
      (they're already gated by the NextAuth session cookie).

### 2.6 Observability

- [ ] Decide where logs go. Stdout streams structured JSON via
      `src/server/log.ts`; collect it with Coolify logs / Vercel
      logs / Loki / Logflare / whatever you have.
- [ ] Plug in error capture if you want post-mortem detail. Replace
      the `emit()` function in `src/server/log.ts` to also send to
      Sentry.io / Highlight / Datadog. Five-line change.
- [ ] Set `LOG_LEVEL=info` in production (default), `LOG_LEVEL=debug`
      in staging.

### 2.7 Backups

- [ ] Suparbase's own Postgres database holds: users, connections
      (encrypted credentials), audit log, agent sessions, sentry
      findings, custom actions, widgets, team memberships.
      **Back this up.** Without it, every connection's stored
      Supabase API key is lost.
- [ ] On Coolify: enable the platform's snapshot feature for the
      `db` service.
- [ ] Test restore at least once. A backup you've never restored is
      worth nothing.

### 2.8 Multi-instance gotchas

If you're running more than one Next.js instance behind a load
balancer:

- [ ] The agent-session attribution cache (`src/server/sentry/sessions.ts`)
      is per-process. After a session undo on instance A, the cache
      on instance B keeps the now-undone session for up to 60s
      (`CACHE_TTL_MS`). New writes from the same fingerprint may
      attach to the closed session for that window. Worst case:
      occasional double-undo, no data loss.
- [ ] The rate-limit map (`src/server/proxy/ratelimit.ts`) is also
      per-process. Limits scale with instance count.
- [ ] For both: a future Redis-backed implementation closes the gap.
      Single-instance Coolify deploys are exact.

---

## 3. Known caveats (deferred)

These are intentionally not blocking launch but worth knowing:

- **`attachToSession()` race**: concurrent first-write-of-a-burst can
  create two sessions instead of one. Bounded harm (UI shows two
  sessions; undo still works on each). Needs a unique partial index
  to fix properly.
- **DDL capture**: `agent_session` only tracks data writes, not
  schema changes. CREATE/ALTER/DROP through the AI agent aren't
  audited and aren't reversible from the Agents page.
- **DNS rebinding for webhook actions**: the URL validator blocks
  literal private IPs and known cloud-metadata hostnames at save
  time, but doesn't resolve hostnames at fire time. A hostile DNS
  could in principle return a private IP at request time. Mitigated
  in practice by `webhook_url` being a per-user-stored value: the
  user is configuring the webhook, not the attacker.
- **Indefinite finding count**: a busy Sentry scan creates one
  `sentry_finding` per matching condition each run. Retention helps,
  but a v3.2 follow-up will upsert findings by `(user, conn, kind,
  schema, table)` instead of inserting duplicates.
- **No HTTP-level integration tests yet**: unit tests cover the
  fingerprinter, the SSRF blocklist, and the undo SQL builder.
  Route handlers are tested only by the migration smoke check + the
  build. A future pass should add `supertest`-style fixtures.

---

## 4. If something breaks

- **Run the retention endpoint manually** to confirm the cron secret
  + auth shape: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/retention`.
- **Check the structured logs** for `attachToSession failed` or
  similar - these were silent in v3.1.4, now they tell you what
  went wrong.
- **The probe is read-only**: running `POST /api/connections/<id>/sentry/scan`
  from curl is a safe diagnostic.
- **The undo audit trail** lives in `agent_session.undo_attempted_count`
  + `undo_reverted_count` + `undo_error`. If an undo half-applied,
  the error is captured there.

---

## 5. v3.4 billing + admin smoke (10 min)

Adds Dodo Payments subscription billing and the `/admin` operator
panel. Most can be exercised without a real Dodo account by
exercising the admin grant path; the webhook path needs a Dodo
sandbox.

### One-time setup

- [ ] `pnpm db:push` (or run `dist/migrator.mjs`) - applies the
  `subscription`, `billing_event`, `admin_action` tables and the
  `billing_event.applied_at` column.
- [ ] Set `SUPARBASE_ADMIN_EMAILS=<your email>` in the host env.
  Restart. `/admin` should now be reachable when signed in.
- [ ] (Optional, full billing) Set `DODO_API_KEY` +
  `DODO_WEBHOOK_SECRET` + `DODO_HOSTED_PRODUCT_ID`. In the Dodo
  dashboard, configure the webhook endpoint to
  `https://<host>/api/webhooks/dodo`.

### Admin panel happy-path (no Dodo required)

- [ ] Visit `/admin` - dashboard loads with user/MRR stats.
- [ ] Visit `/admin/users` - search by email works; pill shows the
  user's plan.
- [ ] Open a user → **Grant a plan** → choose Hosted, leave date
  blank → save. The user's plan flips to Hosted with `granted_by_admin`
  set. Refresh `/admin/users` and confirm the pill says `hosted·comp`.
- [ ] On the same user, **Grant** again with `expiresAt` = yesterday
  → save → check `/admin/users/[id]`. Despite the row saying Hosted,
  re-running the resolver via any gated request should treat this user
  as Free (the cliff is honoured). Hit `POST /api/connections` from
  this account and confirm 402 fires once they hit their second.
- [ ] **Reset** the user → plan returns to Free.

### Hard-limit enforcement (no Dodo required)

- [ ] Create a fresh Free-tier user with 1 connection.
- [ ] Try to add a 2nd connection → form shows the `PaywallCard` with
  "See plans" link.
- [ ] Try to invite a teammate from the Members tab → server returns
  402 `plan_limit`; UI surfaces it.

### Dodo webhook smoke (needs Dodo sandbox)

- [ ] In the Dodo dashboard, send a test event (`subscription.active`)
  with `metadata.user_id` set to a real Suparbase user id.
- [ ] Hit `/admin/billing` - the event row shows `Applied ✓`.
- [ ] The targeted user's plan in `/admin/users/[id]` flips to Hosted
  with the correct `current_period_end`.
- [ ] Re-send the same event → second row does NOT appear (dedupe on
  `webhook-id`); `Applied ✓` from the first remains.
- [ ] Send `subscription.cancelled` → the plan flips to Free in the
  resolver (the `status` column says `cancelled` but the user can no
  longer create extra connections / invite teammates).

### Checkout (needs Dodo sandbox + a test card)

- [ ] As a Free user, visit `/settings/billing` → click
  **Start 7-day trial** → redirected to Dodo's hosted checkout.
- [ ] Pay with a Dodo test card → redirected back to
  `/settings/billing?status=success`.
- [ ] Within a few seconds the dashboard reflects `trialing` status.
- [ ] Cancel through Dodo's customer flow → webhook lands → state
  flips to `cancelled` on the next refresh.

### Known limitations

- Self-serve plan changes aren't supported in-app - cancel + re-sub
  through Dodo, then admin grants if needed.
- The admin grant `expiresAt` is set to 23:59:59 UTC of the chosen
  day, not local time.
- Unrecognised webhook event types are recorded but not applied
  (and surfaced in the `unapplied` banner on `/admin/billing` so an
  operator notices).

---

## 6. v3.6 – v3.8 account + observability smoke (15 min)

Adds the password reset / account deletion / 2FA / observability /
status page surfaces. None requires a new external account to test
the happy path, but Sentry + PostHog + UptimeRobot are recommended.

### One-time setup

- [ ] `pnpm db:push` - applies migrations `0014_cuddly_fabian_cortez`
  (password_reset_token) and `0015_real_proudstar` (TOTP secret +
  user_recovery_code table).
- [ ] Verify `AUTH_SECRET` is set to a strong random value. The 2FA
  cookie HMAC depends on it; rotating AUTH_SECRET invalidates every
  in-flight MFA-ok cookie (expected).
- [ ] (Optional) Set `SENTRY_DSN`. Copy
  `instrumentation.example.ts` → `instrumentation.ts`,
  `pnpm add @sentry/nextjs`, redeploy. Confirm `/api/health`
  reports `observability: true`.
- [ ] (Optional) Set `NEXT_PUBLIC_POSTHOG_KEY`. Sign in once and
  check the PostHog dashboard for the `$pageview` event + the
  identify call with your email.

### Customer flows (no external account required)

- [ ] **Forgot password**: sign out, go to `/signin`, click
  "Forgot?", enter a real account email. Should see the
  enumeration-resistant confirmation banner regardless of whether
  the email exists. If `RESEND_API_KEY` is set, an email arrives;
  click the link, set a new password ≥12 chars, sign in.
- [ ] **Password change**: while signed in, `/settings/account` →
  Change password card → current + new + confirm. Confirm the
  toast and sign in with the new password.
- [ ] **Self-service account deletion**: brand new test account,
  `/settings/account` → Danger Zone → type "DELETE MY ACCOUNT"
  → confirm. Verify the user row + cascades (connections, settings,
  saved views, dashboards, custom actions, agent sessions, team
  memberships, subscriptions) are gone. Audit log rows keep their
  null user_id.
- [ ] **Data export**: while signed in, `/settings/account` →
  "Download my data (JSON)". File saves; confirm the JSON contains
  `account`, `connections`, `auditLog` keys + a `notes.encryption`
  disclaimer.

### 2FA round-trip

- [ ] Go to `/settings/account/2fa` → Enable. Scan the QR with
  any authenticator (1Password, Bitwarden, Google Authenticator,
  Authy). Enter the 6-digit code → see the 10 recovery codes
  page. Download or copy them.
- [ ] Sign out, sign back in. After password succeeds, you should
  be redirected to `/signin/2fa`. Enter a fresh code → land on
  `/connections`. The `suparbase-mfa-ok` cookie is set for 24h.
- [ ] Test recovery: at `/signin/2fa`, click "Use a recovery
  code", paste one of the saved codes (with or without dashes).
  Should succeed and consume the code (next attempt with the
  same one fails).
- [ ] Disable: `/settings/account/2fa` → enter current password →
  Disable. Sign-out + sign-in should no longer redirect to
  `/signin/2fa`.

### Operator observability

- [ ] `curl https://<host>/api/health` → 200 with
  `{ db: true, email: <bool>, billing: <bool>,
     observability: <bool>, version: "<x.y.z>" }`.
- [ ] Visit `/status` while signed out - every subsystem renders
  with an Operational / Not-configured badge that matches what
  `/api/health` returned.
- [ ] (If Sentry is wired) trigger an error: visit `/admin/users/<not-a-uuid>`
  while signed in as an admin. The page should 404 cleanly. To
  test the boundary, throw an error from a route handler in a
  scratch branch and confirm the Sentry inbox catches it.

### Admin parity

- [ ] `/admin/audit?user=<id>` filters audit_log by user. Apply
  a date range. The query plan should hit `audit_conn_recent_idx`.
- [ ] `/admin/users/[id]` shows the user's connection list +
  the "View audit log for this user" deep-link.

### Known limitations

- 2FA enforcement gates protected *pages*. API routes are not
  gated - a leaked session cookie can still hit `/api/v/...`
  endpoints. This is acceptable because session cookies are
  `httpOnly: true; secure: true; sameSite: lax` and exfiltration
  requires XSS, which is broadly prevented by Next's auto-escape
  + our CSP-friendly markup.
- Password change does NOT terminate other active sessions. A
  future hardening pass should invalidate every NextAuth session
  for the user on password change.
- Data export is capped at 100k audit rows. Customers above that
  bracket need an offline dump from the operator.
- The Dodo "Manage subscription" button calls
  `/api/billing/portal` which mints a fresh customer-portal URL.
  If your sandbox Dodo account doesn't have the portal enabled,
  the API returns 502 and the UI tells the user to follow the
  receipt-email link instead.
