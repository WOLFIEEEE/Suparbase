# Changelog

All notable changes between Suparbase versions. Each version corresponds
to a Spec-Kit feature directory under [`specs/`](specs/) and a git tag.

## v0.4.0 — 2026-05-13 — Coolify deployment

Tag: `v0.4.0` · Spec: [`specs/004-deploy-coolify/`](specs/004-deploy-coolify/)

- Production `Dockerfile` (multi-stage, non-root, Next.js standalone output).
- `docker-compose.yaml` with two services: `supabase/postgres` for the
  app database, and the Next.js app. No host port binding — Coolify's
  Traefik proxy routes by domain.
- `scripts/migrate.mjs` runs Drizzle migrations at container start.
- Operator only sets six env vars in Coolify; three of them Coolify can
  generate (`POSTGRES_PASSWORD`, `AUTH_SECRET`, `SUPARBASE_ENCRYPTION_KEY`).
  `DATABASE_URL` is composed inside the compose file.
- Constitution v3.1.0 unchanged (no new principle needed for deploy).

## v0.3.0 — 2026-05-13 — AI-augmented admin presets

Tag: `v0.3.0` · Spec: [`specs/003-ai-augmented-admin/`](specs/003-ai-augmented-admin/)

- Constitution **v3.0.0 → v3.1.0**: added Principle IX (AI Assistance)
  — opt-in, server-only, schema-only inputs, Zod-validated outputs,
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

## v0.2.0 — 2026-05-13 — Authenticated SaaS

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
- **Server-side PostgREST proxy** at `/api/v/[id]/rest/[...path]` —
  the user's API key never reaches the browser. Streams responses,
  rate-limits writes, logs every write to an audit table.
- Replaced `supabase-js` (browser) with a small `pgrest()` fetch
  client targeting the proxy. Bundle dropped ~53 KB.
- HSTS / CSP / X-Content-Type-Options / Referrer-Policy /
  Permissions-Policy at the Next.js edge.

## v0.1.0 — 2026-05-13 — Client-only Vite SPA

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
