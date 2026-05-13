# Phase 0 — Research (delta from v0.1)

Only decisions specific to the SaaS migration are recorded here. The
v0.1 research file ([../001-supabase-admin/research.md](../001-supabase-admin/research.md))
covers schema introspection, FK parsing, label-column heuristics, and
the field-component selection logic; those decisions stand.

## 1. Framework choice

**Decision**: Next.js 15 App Router.

**Rationale**: NextAuth v5 is purpose-built for it; server components
give us a free trust boundary; route handlers (`route.ts`) are the
right place for the proxy and CRUD endpoints; Vercel/Node deployment
is one command.

**Alternatives considered**:
- Remix: equally good architecturally, but NextAuth's Remix story
  trails the Next.js one and the user asked for NextAuth.
- Vite + Express backend: more moving parts, no SSR for the marketing
  surface.

## 2. Auth provider

**Decision**: GitHub OAuth, only provider in v1.

**Rationale**: This is a developer tool. Devs already have GitHub. No
email server, no SMTP, no captcha needed. NextAuth ships the provider.

**Alternatives considered**:
- Magic link via Resend: nice but requires an email vendor and SPF
  setup. Pushed to v1.1.
- Password + email verification: pure overhead for a dev tool.

## 3. Encryption strategy

**Decision**: AES-256-GCM via Node `crypto`, ciphertext format:

```
[ version_byte | iv (12 bytes) | ciphertext | auth_tag (16 bytes) ]
```

stored as a single `bytea` column in Postgres. The encryption key is a
32-byte value sourced from the `SUPARBASE_ENCRYPTION_KEY` env var,
base64-encoded.

**Rotation**: bumping the version byte and providing
`SUPARBASE_ENCRYPTION_KEY_OLD` lets `decryptKey` try the previous key
on a `version_byte = 0` row and re-encrypt with the new one on next
write. Migration script (`scripts/rotate-encryption-key.ts`) loops the
table for proactive rotation.

**Alternatives considered**:
- KMS (AWS KMS / GCP KMS): correct for serious deployments but adds an
  external dependency for v1. Documented as a v2 upgrade path.
- Argon2-derived key from a passphrase: slower, no rotation story.

## 4. PostgREST client

**Decision**: A tiny `pgrest()` fetch wrapper hits `/api/v/[id]/rest/...`
and the existing `lib/api/rows.ts` is rewritten on top of it. We drop
`@supabase/supabase-js` from the client — saves ~53 KB gz and removes
the only library that knows about the API key.

**Rationale**: `supabase-js` is excellent, but it expects to construct
URLs and headers itself. Routing it through our proxy means either
forking the client or wrapping `fetch` at the global level. A
30-line `pgrest()` is simpler than either.

**API shape** (mimics the slice of `supabase-js` we used):

```ts
pgrest.list(connectionId, schema, table, {
  select, page, pageSize, sort, search, textCols,
});
pgrest.get(connectionId, schema, table, pkFilter);
pgrest.insert(connectionId, schema, table, row, { returning });
pgrest.update(connectionId, schema, table, pkFilter, patch);
pgrest.delete(connectionId, schema, table, pkFilter);
```

The proxy on the server side does NOT use `supabase-js` either — it
forwards the request as fetched.

## 5. Proxy semantics

**Decision**: A single catch-all route at
`/api/v/[connectionId]/rest/[...path]/route.ts` handles all PostgREST
verbs. The handler:

1. Resolves the session (NextAuth).
2. Loads the connection by id from Drizzle.
3. Asserts ownership (`connection.userId === session.user.id`).
4. Decrypts the key via the vault.
5. Builds the upstream URL: `${connection.url}/rest/v1/${path}${search}`.
6. Forwards method, body (streamed), and an allow-list of headers
   (`Range`, `Prefer`, `Content-Type`, `Content-Range`).
7. Injects `apikey` + `Authorization: Bearer …` headers.
8. Pipes the upstream Response back to the client (preserving status,
   `Content-Type`, `Content-Range`).
9. If method is a write (`POST` / `PATCH` / `PUT` / `DELETE`) AND
   the upstream response is 2xx, inserts an audit row.

**Streaming**: `new Response(upstream.body, { ... })` — Next.js
preserves the body stream.

**Body limits**: we cap inbound write bodies at 5 MB to prevent
abuse. PostgREST itself enforces nothing here.

**Errors**: any failure inside the proxy maps via `toAppError` and is
returned as JSON `{ category, message }` with the appropriate status.

## 6. Rate limiting

**Decision**: Token bucket in memory per-user, configurable defaults:

- Reads: unlimited in v1 (we trust authenticated devs).
- Writes: 60 / minute / user.

In-memory means it resets on every deploy and isn't shared across
instances. Acceptable for v1; documented to be replaced with Upstash
Ratelimit in v2.

**Alternatives considered**:
- Upstash Ratelimit: best-in-class but adds a Redis dependency that
  most v1 deploys don't need.

## 7. Audit log

**Decision**: A `audit_log` table with:

```
id              uuid pk
user_id         uuid fk users
connection_id   uuid fk connections (nullable: keep history if conn deleted)
schema          text
table_name      text
primary_key     jsonb
verb            text  -- insert | update | delete
http_status     smallint
created_at      timestamptz default now()
```

We do not store the row payload — only its PK. Reduces storage cost
and the blast radius if the audit log itself leaks.

## 8. Security headers

**Decision**: Set in `next.config.ts` `headers()`:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.supabase.co https://*.supabase.in; img-src 'self' data: blob: https://avatars.githubusercontent.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://github.com
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`script-src 'unsafe-inline'` is required for Next.js hydration scripts.
`form-action` lists `github.com` for the OAuth redirect.

## 9. Server/client boundary enforcement

**Decision**: `import "server-only"` at the top of every
`src/server/**` file. Adds zero runtime cost; throws a clear build
error if a client component accidentally imports it.

## 10. Existing v0.1 code reuse

**Reuse verbatim**: `lib/forms/`, `lib/table/`, `lib/errors.ts` (was
`api/errors.ts`), most of `components/ui/`, `components/data/*` (after
swapping data-fetching hook calls), `components/row/*`.

**Rewrite**: `lib/api/` → `lib/pgrest/` (talks to the proxy).
`lib/schema/introspect.ts` → split: client-side `useIntrospection`
hook calls `/api/v/[id]/introspect`, server-side
`server/schema-introspect/index.ts` does the OpenAPI fetch.

**Drop**: `lib/connection/store.ts` (no localStorage),
`lib/connection/healthcheck.ts` (replaced by signed health endpoint),
`lib/supabase/client.ts` (no more supabase-js).
