# 032 — Dodo Payments billing + admin panel (v3.4.0)

## Goal

Add subscription billing via Dodo Payments and a first-party admin panel
for operating the SaaS. Free tier stays as the default (1 connection,
solo workspace). Paid plan ("Supar Saver", `pdt_0Nev0FKdzw0UxPeUBKItA`,
7-day trial) unlocks unlimited connections and the team workspace.

The integration is **scaffolded against env vars** — without
`DODO_API_KEY` / `DODO_WEBHOOK_SECRET`, the billing UI degrades to a
"coming soon" state and the app still boots. Free-tier limits are
enforced unconditionally because they don't depend on Dodo.

## Why now

v3.3.0 repositioned Suparbase as a privately-held SaaS with a free
tier. v3.3.1 cleaned up every "open source / MIT" affordance. The
free tier needs to be **actually limited** (otherwise there's no
reason to upgrade), and the paid tier needs an **actually working
checkout** (otherwise there's no way to upgrade). This release closes
both gaps and gives the operator (one admin email) a window to see
what's going on.

## Scope

### In scope

- One paid plan: **Hosted** ($12/user/mo, 7-day trial, via Dodo product
  `pdt_0Nev0FKdzw0UxPeUBKItA` aka "Supar Saver").
- Three account states: `free`, `trialing`, `active` (`on_hold`,
  `cancelled`, `expired` are stored but treated as `free`).
- Free-tier hard limits:
  - **Max 1 connection** per user (the 2nd `POST /api/connections`
    returns HTTP 402 with `category: "plan_limit"`).
  - **No team invites** (`POST /api/connections/[id]/members/invitations`
    returns 402 if the *owner* is on the free plan).
- Customer-facing billing surface:
  - `/settings/billing` — shows current plan, trial countdown, paid
    renewal date; "Upgrade" button kicks off Dodo checkout.
  - Checkout redirects to `/settings/billing?status=success|cancelled`
    after Dodo returns.
- Webhook handler at `/api/webhooks/dodo` — verifies the Standard
  Webhooks signature (HMAC-SHA256 of
  `${webhook-id}.${webhook-timestamp}.${raw_body}`), records the event,
  upserts the user's subscription row.
- Admin panel at `/admin`, gated by env-var allowlist
  `SUPARBASE_ADMIN_EMAILS` (CSV of admin emails). Pages:
  - **Dashboard**: total users, paying users, MRR estimate, signups
    this week.
  - **Users**: searchable table of every user, with plan, connection
    count, last login. Click a row → user detail.
  - **User detail**: grant/revoke plan manually (for comp accounts,
    refunds, team-plan customers), reset subscription, view billing
    events for this user.
  - **Webhook events**: a tailable log of recent Dodo webhook
    receipts for debugging.

### Out of scope

- Multiple paid plans (no Team / Pro tier in this release — Team is
  still "Contact sales" → manual admin grant).
- Custom billing portal — Dodo's customer flow handles cancel /
  payment-method updates. The UI just links out.
- Tax / VAT collection (Dodo is Merchant of Record, so this is
  already handled upstream).
- Self-serve plan changes mid-cycle. If a customer needs that, they
  email support and an admin handles it via the admin panel.

## Data model

Three new tables, all in the application Postgres.

### `subscriptions`

Tracks the current state of each user's subscription. One row per
user (created lazily on first paid-feature interaction).

```
user_id (PK, FK users.id)
plan                  enum: 'free' | 'hosted' | 'team'
status                enum: 'none' | 'trialing' | 'active' | 'on_hold' | 'cancelled' | 'expired'
dodo_customer_id      text nullable, unique
dodo_subscription_id  text nullable, unique
current_period_end    timestamptz nullable
trial_ends_at         timestamptz nullable
granted_by_admin      uuid nullable, FK users.id
granted_at            timestamptz nullable
created_at, updated_at
```

The `granted_by_*` columns capture admin-issued comp accounts so we
can tell them apart from real paying customers in the dashboard.

### `billing_events`

Audit log of every webhook receipt. Doubles as the idempotency store
— `webhook_id` is unique so retries are no-ops.

```
id                  uuid PK
webhook_id          text unique     -- standard-webhooks msg id
event_type          text            -- 'subscription.active' etc
dodo_subscription_id text nullable
user_id             uuid nullable, FK users.id
payload             jsonb           -- raw event body
received_at         timestamptz default now()
```

### `admin_actions`

Audit trail of admin-panel actions. Mirrors `audit_log` but for
operator activity, not data writes.

```
id              uuid PK
admin_user_id   FK users.id
action          text     -- 'grant_plan' | 'revoke_plan' | 'reset_subscription'
target_user_id  FK users.id nullable
details         jsonb
created_at      timestamptz default now()
```

## Plan model

Single source of truth: `src/server/billing/plans.ts` exports
`PLAN_LIMITS` keyed by `plan`. The active-plan helper
`getActivePlan(userId)` returns `{ plan, status, isActive, limits }`
based on the `subscriptions` row joined with `trial_ends_at` /
`current_period_end` semantics:

- `trialing` and `current_period_end > now()` → entitled to `hosted` limits.
- `active` and `current_period_end > now()` → entitled to `hosted` limits.
- everything else → `free` limits.

Limits used by routes:

| Limit | Free | Hosted | Team |
|---|---|---|---|
| `connections` | 1 | ∞ | ∞ |
| `teamInvites` | 0 | ∞ | ∞ |

`requireFeature(userId, feature)` is the single helper called by
gated routes. It throws a typed `PlanLimitError` that the route
catches and turns into a 402.

## Dodo integration

### Checkout

`POST /api/billing/checkout` (auth required, free users only):

1. Look up the user's `subscriptions` row.
2. If they already have an active subscription, redirect to
   `/settings/billing` with a flash.
3. Otherwise: call `POST https://test.dodopayments.com/checkouts` with:
   ```json
   {
     "product_cart": [{ "product_id": "pdt_0Nev0FKdzw0UxPeUBKItA", "quantity": 1 }],
     "subscription_data": { "trial_period_days": 7 },
     "customer": { "email": "...", "name": "..." },
     "return_url": "https://app/api/billing/return?status=success",
     "cancel_url": "https://app/api/billing/return?status=cancelled",
     "metadata": { "user_id": "<our user uuid>" }
   }
   ```
4. Return `{ checkoutUrl: <the response's checkout_url> }` to the
   client. The client navigates to it.

### Return

`GET /api/billing/return` — Dodo redirects here after success/cancel.
We don't trust the redirect for state (could be forged); we just
flash the user to `/settings/billing?status=...`. The webhook is the
authoritative state source.

### Webhook

`POST /api/webhooks/dodo`:

1. Read the raw body as text (NOT parsed by Next.js).
2. Verify the signature: HMAC-SHA256 of
   `${webhook-id}.${webhook-timestamp}.${raw_body}` using
   `DODO_WEBHOOK_SECRET`. The result is base64; constant-time
   compare against the `webhook-signature` header (which can hold
   multiple comma-separated versioned signatures — we accept any
   match prefixed `v1,`).
3. Reject if the timestamp is older than 5 minutes (replay defence).
4. Insert into `billing_events` with `webhook_id` unique. If insert
   conflicts → already processed → return 200 immediately.
5. Switch on `event.type`:
   - `subscription.active` → upsert subscription as `active` (or
     `trialing` if `trial_ends_at` is in the future), set
     `current_period_end`, look up `user_id` from `metadata`.
   - `subscription.renewed` → bump `current_period_end`.
   - `subscription.on_hold` → set status to `on_hold` (treated as
     free-tier in entitlement checks).
   - `subscription.cancelled` / `subscription.expired` /
     `subscription.failed` → status to that value; plan stays
     visible so the UI can show "Your subscription ended on…".
   - `subscription.plan_changed` / `subscription.updated` →
     refresh from the payload.
6. Return 200.

CSRF middleware exempts `/api/webhooks/*` because webhooks come from
Dodo's server with no Origin header (would pass anyway) and we don't
want a misconfigured Origin policy to block payments.

## Admin panel

### Access

`requireAdmin()` reads `SUPARBASE_ADMIN_EMAILS` (comma-separated),
compares against `session.user.email` (lowercased). On mismatch:
404 (not 403 — don't acknowledge the surface exists).

### Routes

- `/admin` (dashboard)
- `/admin/users` (list)
- `/admin/users/[id]` (detail with grant/revoke buttons)
- `/admin/billing` (webhook event log, last 200)

Server actions for grant/revoke write an `admin_actions` row before
mutating the `subscriptions` row, so every operator action is
traceable.

## Env vars added

```
# --- Dodo Payments ------------------------------------------------
# Test mode is automatic when DODO_MODE=test (or unset). Switch to
# DODO_MODE=live + a live API key when you're ready.
DODO_API_KEY=                        # Dodo dashboard → Developer → API Keys
DODO_WEBHOOK_SECRET=                 # Dashboard → Developer → Webhooks → Signing key
DODO_HOSTED_PRODUCT_ID=pdt_0Nev0FKdzw0UxPeUBKItA
# DODO_MODE=test                     # test | live (default: test)

# --- Admin panel access -------------------------------------------
# CSV of email addresses that can reach /admin. Lowercased
# comparison. Leave empty to disable the admin panel entirely.
# SUPARBASE_ADMIN_EMAILS=ops@example.com,founder@example.com
```

## Migration safety

- New tables only; no destructive schema change. Drizzle generator
  emits a single migration file.
- Existing users default to `free` plan via app-layer lookup —
  they don't get a `subscriptions` row inserted until they interact
  with billing. The plan resolver treats "no row" as free.

## Test coverage

- `tests/billing-webhook.test.ts` — verifies signature, rejects
  tampered body, rejects stale timestamp, deduplicates by `webhook-id`,
  upserts plan correctly for each event type.
- `tests/billing-plans.test.ts` — `requireFeature` accept/reject for
  every (plan, status, feature) cell.
- `tests/admin-guard.test.ts` — env allowlist parsing, case
  insensitivity, empty env disables access.

## Out of band

- Once a live Dodo account is wired, set the webhook URL in the Dodo
  dashboard to `https://app/api/webhooks/dodo` and copy the signing
  key into `DODO_WEBHOOK_SECRET`.
- Add the operator's email to `SUPARBASE_ADMIN_EMAILS` on the host.
