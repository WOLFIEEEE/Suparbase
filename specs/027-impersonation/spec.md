# Customer impersonation + auth session inspector (v2.3)

## Why
Support engineers debug user-reported issues constantly. They need to
see what a specific user did, what's in their data, which sessions are
active, and they need to be able to send a password reset / magic link
or kill stuck sessions — fast. Right now Suparbase has a user list
(v1.3) but no per-user detail page. Most ops teams build a "customer
view" page in their own admin specifically for this.

## What
A per-user detail page that brings everything about one auth.user into
one screen.

### Route
`/c/[id]/auth-users/[uid]` — opens from any row in the Auth users list.

### Sections
1. **Profile card** — id, email + verification status, phone, providers,
   created / last-sign-in dates, banned-until, app_metadata + user_metadata
   as compact key-value blocks.
2. **Sessions** — list of active sessions from `auth.sessions`, with
   created/refreshed timestamp, IP, user agent. "Revoke" per session,
   "Revoke all" at the top.
3. **Related records** — for every public-schema table that has a
   column named `user_id` / `owner_id` / `created_by`, run a count
   and show the count + "View" link that opens the table filtered.
   This is the "view as user" without changing JWT — surfaces their
   data in one place.
4. **Quick actions** — Send recovery link, Send magic-link invite,
   Sign out all sessions, Delete user.

### Server
- `listSessions(conn, userId)` — direct Postgres via `executeSql()`
  reading `auth.sessions` joined with `auth.refresh_tokens` for last
  refresh.
- `revokeSession(conn, sessionId)` / `revokeAllSessions(conn, userId)`
  — DELETE rows from `auth.sessions`. Requires service_role.
- `findUserRelatedTables(schema)` — scans the introspected schema
  for columns named user_id/owner_id/created_by referencing
  `auth.users(id)` (or just typed as uuid with that name).
- `countRelatedRecords(conn, userId, tables[])` — runs a single SQL
  query that UNIONs SELECT count(*) per table.

### API
- `GET /api/v/[id]/auth-users/[uid]/sessions` → list
- `DELETE /api/v/[id]/auth-users/[uid]/sessions` → revoke all
- `DELETE /api/v/[id]/auth-users/[uid]/sessions/[sessionId]` → revoke one
- `GET /api/v/[id]/auth-users/[uid]/related` → array of `{ schema,
  table, columnName, count, viewUrl }`

## Out of scope for v2.3
- True "impersonate" mode (issuing a temporary JWT as the user).
  Risky and only marginally more useful than the related-records
  view; defer until there's a concrete ask.
- Bulk session revocation across multiple users.
- Auditing impersonation activity (will fall out of v2.4 teams).

## Safety
- All session and admin operations require `service_role` (same
  contract as v1.3 auth-users).
- Direct Postgres reads use the existing `executeSql()` path
  (read-only mode for listing, write mode only for explicit
  revoke calls).
