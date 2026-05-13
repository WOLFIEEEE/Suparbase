# Suparbase

> Authenticated SaaS admin for any Supabase project. Sign in, save your
> projects, and run a real admin dashboard. Your API key is encrypted at
> rest and proxied — it never reaches the browser.

[![Next.js 15](https://img.shields.io/badge/next-15-0A0A0B?labelColor=B6FF3C)](#)
[![NextAuth v5](https://img.shields.io/badge/auth-nextauth_v5-0A0A0B?labelColor=B6FF3C)](#)
[![Drizzle](https://img.shields.io/badge/orm-drizzle-0A0A0B?labelColor=B6FF3C)](#)
[![AES-256-GCM at rest](https://img.shields.io/badge/vault-AES--256--GCM-0A0A0B?labelColor=B6FF3C)](#)
[![OpenRouter](https://img.shields.io/badge/ai-OpenRouter-0A0A0B?labelColor=B6FF3C)](#)

## What this is

Suparbase is a multi-tenant SaaS that gives any Supabase user a working
admin dashboard for their own project. Sign in with GitHub, paste your
project URL + API key, and you get:

- **Schema-aware data grid** — sort, search (server-side `ilike`),
  pagination, FK cells that resolve to human labels.
- **Type-aware forms** — text, textarea, number, switch, datetime,
  UUID, JSON editor with validation, enum select, searchable FK
  picker.
- **Delete with undo** — confirm + 5-second re-insert.
- **Schema view** — every table, every column, with type, nullable,
  default, FK target, and comments.
- **Connection management** — multiple projects per account, rename,
  delete, service-role warnings.
- **Audit log of every write** — keyed to user, connection, table, PK,
  verb, status. Indefinite retention in v1.

## AI assistance (optional)

Supply your own OpenRouter API key in `/settings/ai`. Suparbase then:

- Sends the **introspected schema** (table names, column names, types,
  foreign-key targets) to a model of your choice via OpenRouter.
  **Row data is never sent.**
- Receives a strict JSON classification per table — one of `users`,
  `content`, `logs`, `generic` — plus a display name and the columns
  worth showing in a list view.
- Caches the result keyed by a SHA-256 of your schema. The same schema
  is analyzed at most once per change.
- Routes each table to a **purpose-built admin preset**:
  - **UsersAdmin** — avatar + email cards, role chips, status pill,
    "Invite user" action.
  - **ContentAdmin** — title + excerpt, status pill, sorted by
    `published_at desc`.
  - **LogsAdmin** — reverse-chronological, expandable JSON payloads,
    read-only.
  - **GenericAdmin** — the regular CRUD experience (fallback for
    anything we can't classify, or for tables you manually switch to).

A `?view=generic` URL param overrides the preset per session. If you
don't provide an OpenRouter key, a built-in **heuristic classifier**
still routes obvious tables to the right preset — the AI step is
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
  for someone else's connection id receives 404 (not 403 — we don't
  acknowledge that the row exists).
- **JWT-shaped substrings are defensively redacted** from any error
  message before logging, in any process.
- Writes are **rate-limited** per user (60/minute default), tracked
  in an audit log, and recorded with the affected table/PK.
- The credential vault supports **versioned ciphertext** so you can
  rotate the encryption key without downtime — see
  `src/server/crypto/vault.ts`.

## Deploy on Coolify (recommended)

This repo ships a production-ready `Dockerfile` and `docker-compose.yaml`.
The compose file declares two services:

- **`db`** — `supabase/postgres:15.1.1.78` (Postgres + the extensions
  Supabase ships).
- **`app`** — this Next.js app, built as a standalone Node 20 image.
  Runs Drizzle migrations at startup, then `next start`.

### In Coolify (zero env vars required)

1. **Create resource** → **Docker Compose** → point at this repo.
2. **Deploy**. That's it.

The compose file declares three services that boot in order:

- **`bootstrap`** (Alpine, runs once) — writes three strong random
  secrets into a `suparbase_secrets` Docker volume:
  `postgres_password`, `auth_secret`, `encryption_key`. On every
  subsequent deploy this is a no-op — the existing secrets are
  reused.
- **`db`** — `supabase/postgres`. Reads its password from
  `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password`.
- **`app`** — this Next.js app. Entrypoint reads each secret file,
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

Without these env vars, Suparbase still works fine — users sign up
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

If the app container exits during startup, check Coolify's logs view —
the most likely culprits are a missing required env var or a DNS issue
preventing `app` from reaching `db`.

---

## Local development

### Prerequisites

- Node.js 20 LTS
- pnpm 9
- Postgres (Supabase, Neon, or local Docker)
- A GitHub OAuth app — [github.com/settings/developers](https://github.com/settings/developers)
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

## Spec-Kit artifacts

Built spec-first across three features. The full audit trail:

### v0.3 — AI-augmented admin presets (`003-ai-augmented-admin/`)

| Document                                                          | Contents                              |
|-------------------------------------------------------------------|---------------------------------------|
| [`spec.md`](specs/003-ai-augmented-admin/spec.md)                 | User stories around OpenRouter and presets. |
| [`plan.md`](specs/003-ai-augmented-admin/plan.md)                 | New schema tables, lazy preset loading.     |
| [`research.md`](specs/003-ai-augmented-admin/research.md)         | OpenRouter, prompt design, fingerprinting.  |
| [`data-model.md`](specs/003-ai-augmented-admin/data-model.md)     | `user_settings`, `schema_analysis`.         |
| [`contracts/`](specs/003-ai-augmented-admin/contracts/)           | AI APIs + preset selector contract.         |
| [`tasks.md`](specs/003-ai-augmented-admin/tasks.md)               | Phase-by-phase task list.                   |

### v0.2 — Authenticated SaaS (`002-suparbase-saas/`)

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

v0.3 — usable end-to-end against any Supabase project, with optional
AI-driven preset routing via OpenRouter. Out-of-scope for v1: team
workspaces / shared connections, magic-link / passwordless auth,
storage bucket browser, SQL editor, migrations / DDL, billing,
multi-provider AI matrix.

## License

MIT.
