# Phase 1 — Data Model

## Database schema (Postgres, via Drizzle)

### NextAuth tables

Standard `users`, `accounts`, `sessions`, `verification_tokens` as
emitted by `@auth/drizzle-adapter`. Drizzle definitions live in
`src/server/schema/auth.ts`.

```ts
// users
{
  id            uuid pk
  name          text
  email         text unique
  emailVerified timestamptz
  image         text
  createdAt     timestamptz default now()
}

// accounts (NextAuth OAuth account linkage)
{
  userId            uuid fk users.id
  type              text
  provider          text
  providerAccountId text
  refresh_token     text
  access_token      text
  expires_at        bigint
  token_type        text
  scope             text
  id_token          text
  session_state     text
  primary key       (provider, providerAccountId)
}

// sessions
{
  sessionToken text pk
  userId       uuid fk users.id
  expires      timestamptz
}

// verification_tokens (unused with OAuth, kept for adapter compat)
{
  identifier text
  token      text
  expires    timestamptz
  primary key (identifier, token)
}
```

### App tables

#### `connections`

```ts
{
  id              uuid pk default gen_random_uuid()
  userId          uuid fk users.id on delete cascade
  name            text not null              // user-chosen label
  url             text not null              // origin only, https://abc.supabase.co
  hostname        text not null              // abc.supabase.co (denormalized for cheap reads)
  role            text not null              // "anon" | "authenticated" | "service_role" | "unknown"
  encryptedKey    bytea not null             // [version(1) | iv(12) | ct | tag(16)]
  createdAt       timestamptz default now()
  lastUsedAt      timestamptz default now()
  index userId_idx on (userId)
  unique (userId, name)                       // no duplicate names per user
}
```

The plaintext key NEVER appears in this table. The `encryptedKey` blob
includes a leading version byte so the vault knows which key to try.

#### `audit_log`

```ts
{
  id            uuid pk default gen_random_uuid()
  userId        uuid fk users.id on delete set null
  connectionId  uuid fk connections.id on delete set null  // history survives connection deletion
  schemaName    text
  tableName     text
  primaryKey    jsonb                           // {col: value, ...}
  verb          text not null                   // insert | update | delete
  httpStatus    smallint not null
  createdAt     timestamptz default now()
  index userId_idx on (userId)
  index connectionId_idx on (connectionId)
  index createdAt_idx on (createdAt desc)
}
```

We do not store the row payload — just the PK that was affected.

### Migrations

A single initial migration `drizzle/0000_initial.sql` creates the
tables above. Drizzle Kit generates the SQL from the schema files.

## Domain types (TypeScript, shared)

```ts
// src/lib/types/connection.ts
export type KeyRole = "anon" | "authenticated" | "service_role" | "unknown";

export interface ConnectionSummary {
  id: string;
  name: string;
  hostname: string;
  url: string;
  role: KeyRole;
  createdAt: string; // ISO
  lastUsedAt: string;
}
```

```ts
// src/lib/types/schema.ts  (identical to v0.1 shape)
export interface Column { /* … */ }
export interface Table { /* … */ }
export interface Schema {
  introspectedAt: number;
  hostname: string;
  tables: Table[];
}
```

## API surfaces (shapes)

```ts
// GET /api/connections                  → ConnectionSummary[]
// POST /api/connections {name, url, key} → ConnectionSummary (no key in response)
// GET /api/connections/:id              → ConnectionSummary
// PATCH /api/connections/:id {name}     → ConnectionSummary
// DELETE /api/connections/:id           → 204

// GET /api/v/:id/introspect             → Schema (server-side introspection)

// ANY /api/v/:id/rest/:path*            → proxy passthrough
```

## React Query keys

```ts
[ "connections" ]
[ "connection", id ]
[ "schema", id ]
[ "rowCount", id, schema, tableName ]
[ "rows", id, schema, tableName, listParams ]
[ "row", id, schema, tableName, pk ]
[ "fkLabels", id, fkSchema, fkTable, fkColumn, term ]
```

The connection id replaces v0.1's `hostname` in cache keys because
the same hostname can be used by multiple users (and one user can
save multiple connections to the same host).

## State

- Server: Postgres is authoritative.
- Client cache: React Query (server state).
- Client URL state: `useSearchParams` for table list view filters.
- Local component state: only for transient UI (drawer open, etc.).
