# Suparbase

> Authenticated SaaS admin for any Supabase project. Sign in, save your
> projects, and run a real admin dashboard. Your API key is encrypted at
> rest and proxied: it never reaches the browser.

[![CI](https://github.com/WOLFIEEEE/Suparbase/actions/workflows/ci.yml/badge.svg)](https://github.com/WOLFIEEEE/Suparbase/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-v1.1.0-0A0A0B?labelColor=B6FF3C)](https://github.com/WOLFIEEEE/Suparbase/releases)
[![Next.js 15](https://img.shields.io/badge/next-15-0A0A0B?labelColor=B6FF3C)](#)
[![NextAuth v5](https://img.shields.io/badge/auth-nextauth_v5-0A0A0B?labelColor=B6FF3C)](#)
[![Drizzle](https://img.shields.io/badge/orm-drizzle-0A0A0B?labelColor=B6FF3C)](#)
[![AES-256-GCM at rest](https://img.shields.io/badge/vault-AES--256--GCM-0A0A0B?labelColor=B6FF3C)](#)
[![OpenRouter](https://img.shields.io/badge/ai-OpenRouter-0A0A0B?labelColor=B6FF3C)](#)

## What's new in v1.1

The archetype taxonomy widens. v1.0 shipped four categories
(Users / Content / Logs / Generic); v1.1 adds three more: each with a
list view + a dedicated detail view, each automatically applied to any
matching table from the AI analysis or the heuristic fallback.

- **Commerce** for orders / invoices / transactions / payments / charges
  / receipts / carts / checkouts. Money columns are formatted via
  `Intl.NumberFormat` (currency picked up from a `currency` column when
  present; `_cents` columns divided by 100 automatically); detail page
  shows the total at display size with a four-step pipeline (Placed →
  Paid → Shipped → Delivered) driven from the canonical status
  vocabulary, with terminal states (refunded / cancelled / failed)
  collapsed to a single note.
- **Tasks** for tickets / issues / todos / cards / jobs / reminders.
  List view groups rows by canonical status bucket (To do / In progress
  / Done / Blocked / Other), collapsing synonyms like `in_progress` /
  `doing` / `active` / `started` / `review`; detail page surfaces
  assignee (linked when the FK is set) + priority chip + overdue badge.
- **Messages** for comments / threads / conversations / replies / notes.
  List rows render as compact chat cards (author + body snippet + reply
  badge); detail page is a single chat bubble with an "in reply to"
  pointer for replies. Distinguished from Content by the absence of a
  slug column.

The OpenRouter prompt + Zod response schema teach the model the new
categories with concrete signals; the heuristic fallback matches the
same shapes so first paint never waits on the model. No new
dependencies. Largest authenticated route stays at 186 KB First Load
JS: well under the 520 KB gz budget.

Spec: [`specs/010-more-archetypes/`](specs/010-more-archetypes/). Full
notes: [`CHANGELOG.md`](CHANGELOG.md).

## What's new in v1.0

The GA release. Polished every previously-rough surface and finished the
v0.7 power-user backlog (saved views + filter chips). Highlights:

- **Unified typography.** Dropped Fraunces; the entire app now uses Inter
  Variable for both body and display (heavier weight + tighter tracking
  on display). One fewer font family loaded; cleaner, more professional
  hierarchy.
- **Generic admin lift.** Every non-archetype table now renders with the
  same chrome as Users/Content/Logs: PageHeader, row cards, BulkBar,
  Export + Import, and a dedicated detail page with hero + sectioned
  identity + Linked-records sidebar. The HTML-table + drawer pattern is
  gone.
- **Schema view rebuild.** Archetype-grouped tables, expandable column
  groups (Identifiers / Fields / Metadata), FK chips that navigate to
  the referenced table.
- **Connection flows polish.** Connections list cards redesigned;
  new-connection page wrapped in `PageHeader`; per-connection Settings
  reorganized into Identity / Security / Danger Zone sections.
- **Saved views.** Save a filter+sort combination as a named view; tabs
  appear in `PageHeader` on every list page; persists per (user,
  connection, table). Capped at 5 custom views per table.
- **Filter chips.** Click `+ Filter` → pick column → pick operator →
  enter value. Multiple chips combine with AND. URL is the canonical
  state; chips are shareable + bookmark-able.

Spec: [`specs/008-v1-polish/`](specs/008-v1-polish/). Full notes:
[`CHANGELOG.md`](CHANGELOG.md).

## What's new in v0.6

A coherent visual + UX overhaul of every workspace surface: the app
reads as a product, not a database admin tool. Highlights:

- **Archetype-grouped Dashboard** that explains the project (Audience /
  Library / Activity) instead of listing "N tables / N views".
- **Tables list** grouped by archetype with a cross-section search; the
  `auth.*` / `storage.*` tables collapse behind a "System tables"
  disclosure.
- **Users, Content, Logs** archetypes have opinionated row cards and
  dedicated detail pages: no more drawer-as-detail.
- **Cmd / Ctrl + K command palette** jumps to any table, connection,
  setting, or action with the keyboard.
- **Dark / light theme toggle** that reads the system preference, paints
  the chosen theme during SSR (no flash on reload).
- **Sticky sidebar + topbar** with backdrop blur. Every authenticated
  page now has a consistent header + footer.
- **AI analysis extension**: `TableAnalysis` now carries primary
  identity (avatar, badge, subtitle), columns to hide by default, and
  FK relations annotated for detail-page surfacing.

Spec: [`specs/006-product-workspace/`](specs/006-product-workspace/).
Full notes: [`CHANGELOG.md`](CHANGELOG.md).

## What this is

Suparbase is a multi-tenant SaaS that gives any Supabase user a working
admin dashboard for their own project. Sign in with GitHub, paste your
project URL + API key, and you get:

- **Schema-aware data grid**: sort, search (server-side `ilike`),
  pagination, FK cells that resolve to human labels.
- **Type-aware forms**: text, textarea, number, switch, datetime,
  UUID, JSON editor with validation, enum select, searchable FK
  picker.
- **Delete with undo**: confirm + 5-second re-insert.
- **Schema view**: every table, every column, with type, nullable,
  default, FK target, and comments.
- **Connection management**: multiple projects per account, rename,
  delete, service-role warnings.
- **Audit log of every write**: keyed to user, connection, table, PK,
  verb, status. Indefinite retention in v1.

## AI assistance (optional)

Supply your own OpenRouter API key in `/settings/ai`. Suparbase then:

- Sends the **introspected schema** (table names, column names, types,
  foreign-key targets) to a model of your choice via OpenRouter.
  **Row data is never sent.**
- Receives a strict JSON classification per table: one of `users`,
  `content`, `logs`, `generic`: plus a display name and the columns
  worth showing in a list view.
- Caches the result keyed by a SHA-256 of your schema. The same schema
  is analyzed at most once per change.
- Routes each table to a **purpose-built admin preset**:
  - **UsersAdmin**: avatar cards with role + status chips, action menu,
    profile detail page with identity panel + linked-records sidebar.
  - **ContentAdmin**: CMS-style row cards (title / status / author /
    published-at), detail page with title hero, readable body, and
    relations sidebar.
  - **LogsAdmin**: time-bucketed event stream (Today / Yesterday / This
    week / Earlier), jsonb payloads collapse to a one-line preview with
    click-to-expand, detail page that pretty-prints the payload.
  - **GenericAdmin**: the regular CRUD experience (fallback for
    anything we can't classify, or for tables you manually switch to).

A `?view=generic` URL param overrides the preset per session. If you
don't provide an OpenRouter key, a built-in **heuristic classifier**
still routes obvious tables to the right preset: the AI step is
strictly additive, never load-bearing.

Your OpenRouter key is encrypted at rest in the same AES-256-GCM
vault used for Supabase keys; it never reaches the browser; LLM calls
run server-side from `src/server/ai/`. Token usage of the last
analysis is shown in `/settings/ai`.

## Security model

This is the core promise:

- API keys are **AES-256-GCM encrypted at rest** in the app database
  (`encrypted_key` column on `connections`). The plaintext key NEVER
  persists to disk.
- The browser **never** receives the key. Every PostgREST call is
  proxied through an authenticated Next.js route handler
  (`/api/v/[id]/rest/[...path]`) which decrypts the key server-side
  and injects it into the outbound request. The browser only ever
  sees its session cookie.
- Every request is **ownership-checked at the row level**: a request
  for someone else's connection id receives 404 (not 403: we don't
  acknowledge that the row exists).
- **JWT-shaped substrings are defensively redacted** from any error
  message before logging, in any process.
- Writes are **rate-limited** per user (60/minute default), tracked
  in an audit log, and recorded with the affected table/PK.
- The credential vault supports **versioned ciphertext** so you can
  rotate the encryption key without downtime: see
  `src/server/crypto/vault.ts`.

## Deploy on Coolify (recommended)

This repo ships a production-ready `Dockerfile` and `docker-compose.yaml`.
The compose file declares two services:

- **`db`**: `supabase/postgres:15.1.1.78` (Postgres + the extensions
  Supabase ships).
- **`app`**: this Next.js app, built as a standalone Node 20 image.
  Runs Drizzle migrations at startup, then `next start`.

### In Coolify (zero env vars required)

1. **Create resource** → **Docker Compose** → point at this repo.
2. **Deploy**. That's it.

The compose file declares three services that boot in order:

- **`bootstrap`** (Alpine, runs once): writes three strong random
  secrets into a `suparbase_secrets` Docker volume:
  `postgres_password`, `auth_secret`, `encryption_key`. On every
  subsequent deploy this is a no-op: the existing secrets are
  reused.
- **`db`**: `supabase/postgres`. Reads its password from
  `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password`.
- **`app`**: this Next.js app. Entrypoint reads each secret file,
  composes `DATABASE_URL` at runtime, runs Drizzle migrations, then
  starts the server.

> ⚠ The `suparbase_secrets` Docker volume is now load-bearing.
> Losing it destroys your encryption key, which means every
> encrypted Supabase + OpenRouter credential becomes unrecoverable
> garbage. **Use Coolify's volume snapshot feature.**

### Optional env vars in Coolify

| Variable | Default | When to set it |
|---|---|---|
| `AUTH_URL` | `https://suparbase.com` | Set to whatever domain Coolify assigned. |
| `AUTH_GITHUB_ID` | (empty) | Set to enable "Continue with GitHub" on the signin page. |
| `AUTH_GITHUB_SECRET` | (empty) | Pair with `AUTH_GITHUB_ID`. |
| `SUPARBASE_AI_DEFAULT_MODEL` | `anthropic/claude-3.5-haiku` | Default OpenRouter model for new accounts. |
| `POSTGRES_PASSWORD` / `AUTH_SECRET` / `SUPARBASE_ENCRYPTION_KEY` | auto-generated | Override the bootstrap if you bring your own. |

### Optional: enable GitHub OAuth

1. <https://github.com/settings/developers> → **OAuth Apps** →
   **New OAuth App**.
2. Homepage URL: your domain (e.g. `https://suparbase.com`).
3. Authorization callback URL: `${AUTH_URL}/api/auth/callback/github`.
4. Save the Client ID and Client Secret and set them in Coolify as
   `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.
5. Restart the app. The Sign in page now shows a "Continue with
   GitHub" button.

Without these env vars, Suparbase still works fine: users sign up
and sign in with email + password (bcrypt-hashed at cost 12 in the
same `users` table).

### What happens on first deploy

1. `bootstrap` writes secrets to the volume → exits 0.
2. `db` starts with `POSTGRES_PASSWORD_FILE` → healthy when
   `pg_isready` returns 0.
3. `app` starts: entrypoint loads `*_FILE` secrets → composes
   `DATABASE_URL` → runs `node scripts/migrate.mjs` → applies every
   SQL file under `drizzle/` → exec `node server.js`.
4. Coolify's Traefik proxy routes your domain to `app:3000`.
5. Visit your domain → landing page → **Create account**.

### Data persistence

The Postgres data directory lives on a named volume
(`suparbase_db_data`). Redeploys, app restarts, and image rebuilds do
not touch it. Use Coolify's snapshot feature for backups.

### Updating

A `git push` to the connected branch triggers a fresh
`docker compose build`. New migrations under `drizzle/` are applied
automatically on the next container start.

### Smoke check after deploy

```bash
curl -fsSL https://your-domain.example/api/health
# → {"status":"ok"}
```

If the app container exits during startup, check Coolify's logs view :
the most likely culprits are a missing required env var or a DNS issue
preventing `app` from reaching `db`.

---

## Local development

### Prerequisites

- Node.js 20 LTS
- pnpm 9
- Postgres (Supabase, Neon, or local Docker)
- A GitHub OAuth app: [github.com/settings/developers](https://github.com/settings/developers)
  - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

### Configure

```bash
cp .env.example .env.local
# Fill in DATABASE_URL, AUTH_GITHUB_*, generate AUTH_SECRET and
# SUPARBASE_ENCRYPTION_KEY:
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "SUPARBASE_ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

### Install + migrate + run

```bash
pnpm install
pnpm db:push          # apply schema to your DATABASE_URL
pnpm dev              # http://localhost:3000
```

1. Click **Sign in with GitHub**.
2. On `/connections`, click **New connection** and paste a Supabase
   project URL + API key. The anon key is recommended; service-role
   triggers a typed acknowledgement before the request fires.
3. Click into the connection to land on the workspace dashboard.

## Build & deploy

```bash
pnpm typecheck
pnpm build
pnpm start
```

For Vercel:

```bash
vercel --prod
```

Set the same env vars in your hosting provider. The proxy uses
`crypto.createCipheriv`, so deploy to **Node runtime** (not edge).

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                       Browser (you)                        │
│   session cookie ────────────────────────────┐             │
│   no API key, ever                            │             │
└───────────────────────────────────────────────┼─────────────┘
                                                │
                ┌───────────────────────────────▼─────────────┐
                │    Next.js (this app)                       │
                │                                             │
                │  /api/auth/*    NextAuth v5                 │
                │  /api/connections          Drizzle ORM      │
                │  /api/v/[id]/rest/*  ◀── proxy + audit      │
                │  /api/v/[id]/introspect ◀── server-side     │
                │                       schema parsing        │
                │                                             │
                │  vault (AES-256-GCM)                        │
                │     ↓ decrypt key per request               │
                └─────┼───────────────────────────────────────┘
                      │
                      ▼
                ┌─────────────────────────────────────────────┐
                │  Your Supabase project                      │
                │  (PostgREST + Postgres)                     │
                └─────────────────────────────────────────────┘
```

### Stack

- **Framework**: Next.js 15 (App Router) on the Node runtime.
- **Auth**: NextAuth v5 (Auth.js) with Drizzle adapter, GitHub OAuth.
- **DB**: PostgreSQL via Drizzle ORM (`postgres` driver).
- **UI**: Tailwind 3, Radix primitives, `lucide-react`, `cmdk`.
- **Data**: `@tanstack/react-query` for client state, custom `pgrest()`
  fetch wrapper to talk to the proxy.
- **Forms**: `react-hook-form` + lightweight Zod-free runtime
  coercion in `src/lib/pgrest/rows.ts`.
- **Motion**: `gsap` on the landing surface only.

### Server / client boundary

`src/server/*` files are marked with `import "server-only"` where
applicable; client components live in `src/components/*` and start
with `"use client"`. Drizzle schema files are deliberately
isomorphic-safe so `drizzle-kit` can import them.

## Database schema

```
users           NextAuth + Drizzle adapter
accounts        OAuth account linkage
sessions        database-backed sessions
verificationTokens (unused with OAuth but kept for adapter compat)
connections     id, user_id, name, url, hostname, role, encrypted_key, created_at, last_used_at
audit_log       id, user_id, connection_id, schema, table_name, primary_key (jsonb), verb, http_status, created_at
```

See [`drizzle/0000_chief_lily_hollister.sql`](drizzle/) for the
generated migration.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Significant features ship via
the Spec-Kit workflow; small fixes and polish can land via a focused PR.
CI runs `tsc --noEmit` + `next build` on every PR.

## Spec-Kit artifacts

Built spec-first across eight features so far. The full audit trail:

### v1.0: Polished release (`008-v1-polish/`)

| Document | Contents |
|---|---|
| [`spec.md`](specs/008-v1-polish/spec.md) | 6 user stories covering generic admin lift, schema view, connection flows, v0.7 final, typography, and the polish pass. |
| [`plan.md`](specs/008-v1-polish/plan.md) | Six-workstream plan + Constitution Check (all 9 principles). |
| [`tasks.md`](specs/008-v1-polish/tasks.md) | Execution-ordered task list. |

### v0.7: Power-user data ops (`007-power-data-ops/`)

The MVP slice (bulk + export + import) shipped in v0.7; the remaining
saved-views + filter-chips work shipped as part of v1.0.

### v0.6: Product workspace (`006-product-workspace/`)

| Document | Contents |
|---|---|
| [`spec.md`](specs/006-product-workspace/spec.md) | 7 user stories (P1–P3) covering Dashboard, Tables list, Content + Logs archetypes, command palette, theme toggle, sidebar polish. |
| [`plan.md`](specs/006-product-workspace/plan.md) | Architecture decisions, Constitution Check (all 9 principles), project structure. |
| [`research.md`](specs/006-product-workspace/research.md) | 10 design-decision write-ups (archetype labels, lazy palette index, theme cookie, etc.). |
| [`data-model.md`](specs/006-product-workspace/data-model.md) | Types each surface reads. No new tables. |
| [`contracts/audit-recent.md`](specs/006-product-workspace/contracts/audit-recent.md) | `GET /api/v/[id]/audit/recent` contract. |
| [`tasks.md`](specs/006-product-workspace/tasks.md) | 40 tasks across 1 setup + 7 foundational + 7 user stories + 7 polish. |
| [`quickstart.md`](specs/006-product-workspace/quickstart.md) | Manual smoke checklist per user story. |

### v0.5: Self-bootstrap & email/password auth (`005-bootstrap-and-credentials/`)

Bootstrap container generates secrets on first deploy; NextAuth Credentials
provider with bcrypt; GitHub OAuth becomes optional.

### v0.4: Coolify deployment (`004-deploy-coolify/`)

Production Dockerfile + docker-compose, Drizzle migrator bundled with
esbuild, zero-config Coolify deploy.

### v0.3: AI-augmented admin presets (`003-ai-augmented-admin/`)

| Document                                                          | Contents                              |
|-------------------------------------------------------------------|---------------------------------------|
| [`spec.md`](specs/003-ai-augmented-admin/spec.md)                 | User stories around OpenRouter and presets. |
| [`plan.md`](specs/003-ai-augmented-admin/plan.md)                 | New schema tables, lazy preset loading.     |
| [`research.md`](specs/003-ai-augmented-admin/research.md)         | OpenRouter, prompt design, fingerprinting.  |
| [`data-model.md`](specs/003-ai-augmented-admin/data-model.md)     | `user_settings`, `schema_analysis`.         |
| [`contracts/`](specs/003-ai-augmented-admin/contracts/)           | AI APIs + preset selector contract.         |
| [`tasks.md`](specs/003-ai-augmented-admin/tasks.md)               | Phase-by-phase task list.                   |

### v0.2: Authenticated SaaS (`002-suparbase-saas/`)

| Document                                                          | Contents                              |
|-------------------------------------------------------------------|---------------------------------------|
| [`spec.md`](specs/002-suparbase-saas/spec.md)                     | User stories, FRs, edge cases, scope. |
| [`plan.md`](specs/002-suparbase-saas/plan.md)                     | Stack, structure, Constitution Check. |
| [`research.md`](specs/002-suparbase-saas/research.md)             | Phase-0 decision log.                 |
| [`data-model.md`](specs/002-suparbase-saas/data-model.md)         | Schema, types, cache keys.            |
| [`contracts/`](specs/002-suparbase-saas/contracts/)               | Auth, connection API, proxy, audit.   |
| [`quickstart.md`](specs/002-suparbase-saas/quickstart.md)         | Dev + deploy + smoke checklist.       |
| [`tasks.md`](specs/002-suparbase-saas/tasks.md)                   | Implementation task breakdown.        |
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Project constitution (v3.0.0).     |

The v0.1 (client-only Vite SPA) spec is preserved at
[`specs/001-supabase-admin/`](specs/001-supabase-admin/) for historical
context.

## Status

**v1.1.0**: Archetype taxonomy widened to seven categories: Users,
Content, Logs, Commerce, Tasks, Messages, Generic: each with list +
detail views automatically applied from the AI analysis (heuristic
fallback when offline). Builds on v1.0's unified visual language;
bulk operations + CSV/JSON export + import + saved views + filter chips
all carry over. Self-host with zero env vars on Coolify or any
docker-compose host.

**Planned next** (see [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to
help):

- **v1.2 "Inline editing"**: click-to-edit cells in the data grid
  with type-appropriate editors, the last piece of the v0.7 backlog
  deferred from v1.0.
- **v1.3 "Postgres-native parity"**: SQL editor (read-only first),
  RLS policy viewer, `auth.users` dedicated admin, Supabase Storage
  browser.
- **v1.4 "Operate-able for real"**: email verification, password
  reset, audit-log UI, 2FA, health / metrics endpoints.

**Out of scope for v1.x**: team workspaces / shared connections,
magic-link / passwordless auth, billing, multi-provider AI matrix
beyond OpenRouter.

## License

MIT.
