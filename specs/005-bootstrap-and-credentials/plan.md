# Implementation Plan: Self-bootstrap & credentials auth

**Branch**: `005-bootstrap-and-credentials` | **Date**: 2026-05-13

## Summary

Two largely independent changes shipped together because they answer
the same UX question ("how much do I have to type to deploy?"):

1. **Self-generated secrets** via a one-shot `bootstrap` init container
   and shared docker volume; explicit env vars still override.
2. **Email + password** signup/sign-in via NextAuth's Credentials
   provider; GitHub OAuth becomes optional.

`AUTH_URL` default becomes `https://suparbase.com` because the operator
told us that's the public domain.

## Architecture deltas

### Secret bootstrap

```
docker-compose:
  bootstrap (alpine:3.20)      run once, writes /secrets/{postgres_password, auth_secret, encryption_key}
    │  volume:                                                                       │
    │  suparbase_secrets       a Docker volume; persists across redeploys             │
    ▼                                                                                  ▼
  db (supabase/postgres)       reads POSTGRES_PASSWORD_FILE      app (this image)
    │ depends_on bootstrap                                       │ depends_on db (healthy)
    │ env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password  │ volume: /secrets:ro
    │                                                            │ entrypoint reads *_FILE → env
    │                                                            │ entrypoint composes DATABASE_URL
```

### Auth

- Session strategy switches from `database` to `jwt`. Existing OAuth
  users keep working; their session cookie is just regenerated on next
  visit. (No production users yet: this is greenfield.)
- New table column: `users.password_hash TEXT NULL`. Bcrypt hash.
- New file: `src/server/auth/credentials.ts` · Credentials provider
  configuration and `authorize()`.
- `src/server/auth.ts` reads `AUTH_GITHUB_ID/SECRET`. When both set,
  the GitHub provider is included; otherwise omitted.
- `/api/auth/signup` route handles new account creation.
- `/signin` page becomes a client component with conditional UI: shows
  GitHub button iff a server-side flag says it's configured.
- New `/signup` page mirrors `/signin`.

## Constitution Check (v3.1.0 still in force)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Performance | PASS | One extra page; bundle delta ≤ +10 KB gz. |
| IV. Accessibility | PASS | Email + password form uses our existing Radix-backed primitives. |
| V. Vault & Proxy | PASS | Vault unchanged. Vault key auto-generation is opt-out: explicit env var still wins. |
| VI. Clean Code | PASS | Bootstrap is a single 12-line shell command in compose. Auth code split into `auth.ts` (composition) and `auth/credentials.ts` (provider). |
| VII. Data & Security | PASS | bcryptjs work factor 12; passwords never logged; redactor recognizes bcrypt prefixes; sign-up IP rate limit; volume permissions 0600. |
| IX. AI Assistance | n/a | No AI features touched. |

**Constitution amendment**: a one-line clarification on Principle VII
(auto-generated secrets are permitted iff they persist with the data
they encrypt and the operator is warned via README). Bump to v3.2.0.

## Files changed

```
docker-compose.yaml                   + bootstrap service, * volumes, * env
scripts/docker-entrypoint.sh          + load *_FILE vars, compose DATABASE_URL
.env.example                          rewritten: all six vars optional

src/server/auth.ts                    conditional GitHub; jwt strategy; credentials wired
src/server/auth/credentials.ts        NEW: provider + authorize()
src/server/auth/passwords.ts          NEW: bcrypt helpers (hash, verify)
src/server/auth/signup.ts             NEW: server-side signup logic
src/server/schema/auth.ts             + password_hash column
src/app/api/auth/signup/route.ts      NEW: POST handler
src/app/signin/page.tsx               rewritten as client form
src/app/signup/page.tsx               NEW
src/components/auth/SignInForm.tsx    NEW
src/components/auth/SignUpForm.tsx    NEW

src/lib/redact.ts                     + bcrypt prefix patterns

drizzle/0002_*.sql                    NEW migration

specs/005-bootstrap-and-credentials/  spec, plan, tasks, contracts
.specify/memory/constitution.md       v3.1.0 → v3.2.0
```

## Complexity Tracking

| Decision | Why | Simpler alternative rejected |
|----------|-----|-------------------------------|
| Bootstrap container, not app-side gen | App-side generation can't set POSTGRES_PASSWORD before db starts. | App-side-only would force the operator to set POSTGRES_PASSWORD by hand. |
| JWT strategy (was database) | Credentials provider doesn't compose with database sessions in NextAuth v5 without custom session row creation. | Custom signIn callback is documented but fragile across NextAuth updates. |
| bcryptjs (not native bcrypt) | Pure-JS: works on Alpine without rebuild. | The native `bcrypt` package needs `python` + build chain in the deps stage. |
