# Implementation Plan: Coolify deployment

**Branch**: `004-deploy-coolify` | **Date**: 2026-05-13

## Summary

Production deploy on Coolify (Docker-Compose mode). One `Dockerfile`
produces a standalone Next.js runtime; one `docker-compose.yaml`
defines `db` (Supabase Postgres image) and `app`; one entrypoint
script runs Drizzle migrations before `next start`. Coolify's built-in
Traefik proxy handles TLS and routing — we do not ship a reverse
proxy.

## Architecture

```
                ┌──────────────────────────────────────┐
                │       Coolify host (your VPS)        │
                │                                       │
                │  Traefik (managed by Coolify)         │
                │   │  TLS terminate, route by domain   │
                │   ▼                                    │
                │  app   :3000   ──── DATABASE_URL ───▶ db
                │  ─────────                             │
                │  Next 15 standalone                    │
                │  Node 20 (non-root)                    │
                │                                        │
                │  db    :5432   supabase/postgres:15    │
                │  ─────────                             │
                │  data on a named volume                │
                └──────────────────────────────────────┘
```

## Files

- `Dockerfile` — multi-stage:
  1. `deps` — install pnpm deps with frozen lockfile
  2. `builder` — copy source, `pnpm build` with `output: "standalone"`
  3. `runner` — copy `.next/standalone`, `.next/static`, `public`,
     `drizzle/`, `scripts/migrate.mjs`, and a tiny entrypoint
- `docker-compose.yaml` — db + app, healthchecks, named volumes,
  `DATABASE_URL` composed in `environment:`
- `.dockerignore` — keep build context tiny
- `scripts/migrate.mjs` — ESM script using
  `drizzle-orm/postgres-js/migrator`
- `scripts/docker-entrypoint.sh` — `node scripts/migrate.mjs && exec
  node server.js`

## Required env (operator-facing)

| Var | Coolify-generated? | Notes |
|-----|--------------------|-------|
| `POSTGRES_PASSWORD`        | ✅ Generate random | strong password, used by both services |
| `AUTH_SECRET`              | ✅ Generate random | NextAuth cookie signing |
| `SUPARBASE_ENCRYPTION_KEY` | ⚠ Generate base64 32-byte | use `openssl rand -base64 32` or Coolify random |
| `AUTH_URL`                 | ❌ operator inputs | e.g. `https://suparbase.example.com` |
| `AUTH_GITHUB_ID`           | ❌ operator inputs | from GitHub OAuth app |
| `AUTH_GITHUB_SECRET`       | ❌ operator inputs | from GitHub OAuth app |
| `SUPARBASE_AI_DEFAULT_MODEL` | optional | defaults to `anthropic/claude-3.5-haiku` |

`DATABASE_URL` is composed inside `docker-compose.yaml`; the operator
does not set it.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance First | PASS | Standalone image trims node_modules to runtime essentials; image ≤ 250 MB. |
| IV. Accessibility | PASS | Deployment doesn't affect UI semantics. |
| V. Vault & Proxy | PASS | Encryption key is set via env; never baked into the image. |
| VI. Clean Code | PASS | Migrator is one file; entrypoint is six lines; Dockerfile is conventional multi-stage. |
| VII. Data & Security | PASS | App runs as non-root (`nextjs`); no host-port binding; DATABASE_URL composed not pasted; `.env.example` lists no secrets verbatim. |

## Complexity Tracking

| Decision | Why | Simpler alternative rejected |
|----------|-----|-------------------------------|
| Migrator as a separate `.mjs` (not drizzle-kit) | drizzle-kit pulls in `tsx` + heavy CJS deps; we ship the small migrator. | Including drizzle-kit in prod bloats the image by ~40 MB. |
| Supabase Postgres image instead of `postgres:16` | User asked for it explicitly; gives us pgcrypto, pgsodium, etc. for free in case future features need them. | Plain `postgres:16` would work fine for our schema today, but adds zero benefit. |
| No bundled Studio / Kong | We are an admin tool for Supabase, not a Supabase host. | Bundling the full stack confuses the deployment model. |
