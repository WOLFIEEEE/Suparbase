# Feature Specification: Suparbase — Authenticated SaaS

**Feature Branch**: `002-suparbase-saas`

**Created**: 2026-05-13

**Status**: Draft

**Input**: User description: "A proper SaaS version: real database, real auth via NextAuth, server-side credential vault, encrypted connections. The Supabase admin functionality from v0.1 stays, but is now layered behind a user account and a server-side proxy. Keys never reach the browser."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sign up, save a connection, browse data (Priority: P1)

A developer arrives on the marketing landing page, clicks "Sign in with
GitHub", lands on the connections dashboard, clicks "New connection",
pastes their Supabase project URL + API key, and is taken to a working
admin for that project. Their credentials never leave the server in
plaintext; the browser only ever has a session cookie.

**Why this priority**: Without this flow, nothing else exists.

**Independent Test**: From a fresh database and an unauthenticated
browser, complete the full happy path and verify that (a) the key is
stored encrypted, (b) the browser never receives the key in any
response payload, (c) every PostgREST call goes through `/api/v/...`,
(d) the user lands on a working dashboard.

**Acceptance Scenarios**:

1. **Given** a visitor on `/`, **When** they click "Sign in with GitHub",
   **Then** they are redirected to GitHub OAuth and back to a
   `/connections` page with a session cookie set.
2. **Given** an authenticated user on `/connections`, **When** they
   submit a new connection with a valid URL + key, **Then** the
   credential is encrypted server-side (the API response body MUST NOT
   contain the plaintext key), the connection appears in their list,
   and clicking it navigates to `/c/[id]` where the dashboard loads.
3. **Given** an authenticated user on `/c/[id]`, **When** the dashboard
   queries data, **Then** every network request observable in the
   browser DevTools targets `/api/v/[id]/...`, NOT `*.supabase.co`,
   and no `apikey` or `Authorization: Bearer ey...` header is set by
   the browser.
4. **Given** a service-role key is detected via the JWT `role` claim,
   **When** the connection is created, **Then** the connection is
   flagged in the database and the UI surfaces a persistent warning
   on every workspace screen.

---

### User Story 2 — Manage multiple connections (Priority: P1)

A user can save several Supabase projects, name them, switch between
them, rename them, and delete them. Deletion cryptographically erases
the stored credentials.

**Why this priority**: SaaS without multi-project support is a worse
product than the v0.1 SPA we just shipped.

**Independent Test**: As an authenticated user, create three
connections to three different fake Supabase URLs, switch between
their workspaces, rename one, delete one, and verify the deleted
connection's row no longer exists in the DB.

**Acceptance Scenarios**:

1. **Given** a user with three saved connections, **When** they open
   `/connections`, **Then** they see all three with names, host, role
   badge, and last-used-at.
2. **Given** a user on a connection's workspace, **When** they click
   "Rename" and submit a new label, **Then** the label updates in the
   DB and reflects across all surfaces.
3. **Given** a user clicks Delete on a connection, **When** they
   confirm, **Then** the database row is removed and any subsequent
   request to `/api/v/[id]` returns 404.

---

### User Story 3 — Browse, create, edit, delete data through the proxy (Priority: P1)

All the v0.1 admin functionality (data grid, sort/search/pagination,
type-aware forms, FK picker, delete with undo, schema view) is
preserved — but every call routes through the authenticated proxy.
Writes are recorded in an audit log.

**Why this priority**: The admin functionality is the product. No
regressions allowed.

**Independent Test**: With a real Supabase project linked, exercise
every CRUD path. Verify the audit log records each write with the
correct user, connection, table, PK, and verb.

**Acceptance Scenarios**:

1. **Given** a user on `/c/[id]/tables/posts`, **When** they sort,
   search, and paginate, **Then** the data grid behaves identically
   to v0.1; URL state is preserved.
2. **Given** a user submits a new-row form, **When** the proxy
   responds, **Then** the row appears optimistically and an
   `audit_log` row is inserted with `verb = insert`.
3. **Given** a user deletes a row with undo, **When** they click Undo
   within 5 seconds, **Then** the row is re-inserted and a SECOND
   audit row is logged with `verb = insert`.
4. **Given** a user lacks RLS access for the row, **When** the
   underlying PostgREST returns 403, **Then** the proxy passes the
   status through and the UI surfaces it via `ErrorBanner`.

---

### User Story 4 — Account management & sign-out (Priority: P2)

A user can see their profile (avatar, email, GitHub handle), sign out
on demand, and see when their session expires.

**Independent Test**: Verify avatar/email visible; sign out clears the
session cookie; bare `/connections` redirects to `/signin`.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they open the account
   menu, **Then** they see their avatar, name, and a "Sign out"
   action.
2. **Given** they click Sign out, **When** the action completes,
   **Then** the session cookie is cleared and they land on `/`.

---

### Edge Cases

- **Encryption key missing or wrong**: API returns 500 with a clear
  internal error; the offending request is NOT recorded as completed.
- **Encryption key rotation**: ciphertext is versioned; old rows are
  re-encrypted lazily on next decrypt, or via a migration script.
- **Deleted user**: cascade deletes their connections (audit log
  retained with `user_id` only — keep for incident response).
- **Multi-tab session expiry**: client receives 401 on next call,
  toast prompts re-sign-in.
- **OAuth provider rejection**: bounce to `/signin?error=...` with a
  legible message.
- **Mobile**: same responsive treatment as v0.1 (read works at
  `<768px`, edit best on larger screens).
- **Service-role key**: a persistent banner on every workspace screen
  for that connection.
- **Sign-up rate-limiting** is out of scope for v1 (we don't run our
  own email, GitHub OAuth provides the friction).

## Requirements *(mandatory)*

### Functional Requirements

**Authentication**

- **FR-001**: Unauthenticated visitors MUST land on a marketing landing
  page at `/` and a sign-in page at `/signin`.
- **FR-002**: Sign-in MUST be implemented via NextAuth v5 with GitHub
  OAuth as the only provider in v1.
- **FR-003**: Sessions MUST be stored in the database via the Drizzle
  adapter; cookies MUST be `HttpOnly`, `Secure`, `SameSite=Lax`.
- **FR-004**: Unauthenticated requests to any `/api/*` route except
  `/api/auth/*` and `/api/health` MUST return 401.
- **FR-005**: Unauthenticated requests to any `/c/*` or `/connections`
  route MUST redirect to `/signin?next=...`.

**Connection management**

- **FR-010**: Users MUST be able to create a connection by submitting
  a name, project URL, and API key.
- **FR-011**: The API key MUST be encrypted with AES-256-GCM before
  insert; the plaintext MUST never persist to disk.
- **FR-012**: API responses about connections MUST NOT include the
  decrypted key. The encrypted value is for server use only.
- **FR-013**: The connection list endpoint MUST return for each
  connection: id, name, hostname (host only — never the full URL is
  fine, but never the key), role, createdAt, lastUsedAt.
- **FR-014**: Users MUST be able to rename a connection.
- **FR-015**: Users MUST be able to delete a connection. Deletion
  removes the encrypted credential row; cascade behavior for the
  audit log is to retain the rows with `connection_id` set to NULL.
- **FR-016**: A user MUST NOT be able to read, modify, or delete a
  connection owned by another user. Ownership check at the row level
  is mandatory.
- **FR-017**: The JWT `role` claim MUST be decoded on insert and
  stored alongside the connection. Service-role connections MUST
  carry a visible warning on every workspace surface.

**Proxy**

- **FR-020**: All PostgREST interaction MUST go through
  `/api/v/[connectionId]/rest/v1/...`.
- **FR-021**: The proxy MUST verify the session, fetch the connection,
  verify ownership, decrypt the key, and forward the request to the
  user's Supabase URL with `apikey` + `Authorization: Bearer ...`
  headers.
- **FR-022**: The proxy MUST stream responses, not buffer entire
  bodies, to keep memory predictable for large list pages.
- **FR-023**: The proxy MUST pass through `Content-Type`, `Range`,
  `Content-Range`, `Prefer`, status codes and bodies verbatim except
  for the apikey header.
- **FR-024**: Write verbs (`POST`, `PATCH`, `PUT`, `DELETE`) MUST be
  rate-limited per user (default 60 writes / minute / user) and MUST
  produce an audit log row on success.
- **FR-025**: Schema introspection MUST go through
  `/api/v/[connectionId]/introspect` and run server-side.

**Workspace UX** (parity with v0.1)

- **FR-030** … **FR-070**: All v0.1 functional requirements from spec
  `001-supabase-admin` apply to the workspace at `/c/[id]/...` — data
  grid sort/search/pagination, type-aware create/edit forms, FK
  picker, delete with undo, schema view, mobile nav.

**Cross-cutting**

- **FR-080**: HTTP responses MUST include security headers: HSTS,
  CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **FR-081**: No API key or session secret MUST appear in any log,
  console message, error report, or audit record. JWT-shaped strings
  are redacted before logging.
- **FR-082**: Every write through the proxy MUST insert an `audit_log`
  row capturing user_id, connection_id, table, primary_key, verb,
  http_status, and timestamp.
- **FR-083**: The app MUST be keyboard-navigable end-to-end.
- **FR-084**: `prefers-reduced-motion: reduce` MUST be honored on
  the landing surface and on workspace transitions.

**Out of scope for v1**

- Team workspaces, shared connections, role-based access.
- SSO providers other than GitHub.
- Magic-link / passwordless auth.
- Encryption-key rotation tooling (versioned ciphertext is in place;
  rotation is a manual ops step).
- 2FA enforcement.
- Storage browser, SQL editor.
- Mobile-first editing UX.
- Billing / subscription tiers.

### Key Entities

- **User**: id, name, email, image, createdAt. Owned by NextAuth.
- **Account**: NextAuth's GitHub OAuth account row.
- **Session**: NextAuth session (DB-backed).
- **Connection**: id, userId, name, url, hostname, role,
  encryptedKey (ciphertext blob + IV + version), createdAt,
  lastUsedAt.
- **AuditLog**: id, userId, connectionId (nullable), tableName,
  primaryKey (text), verb, httpStatus, createdAt.

## Success Criteria *(mandatory)*

- **SC-001**: A new user can sign in, save a connection, and open a
  working dashboard within 90 seconds of arriving on `/`.
- **SC-002**: For schemas of ≤50 tables × 100 columns, introspection
  completes within 4 seconds (1s tolerance over v0.1 to account for
  the proxy hop).
- **SC-003**: Table list view first paint occurs within 1.5s of
  navigation for tables ≤1k rows on broadband (0.5s tolerance over
  v0.1).
- **SC-004**: Lighthouse on the landing page achieves Performance ≥90,
  Accessibility ≥95, Best Practices ≥95 on a production build.
- **SC-005**: A penetration tester impersonating User B and using
  User A's connection id MUST receive 404 on `/api/v/[A's id]/*` and
  MUST NOT be able to enumerate `connection_id` values.
- **SC-006**: A grep of build output for `apikey=`, `Authorization:
  Bearer ey`, or any other JWT-shaped substring finds zero matches.
- **SC-007**: A keyboard-only user can complete the entire happy
  path (sign-in → new connection → CRUD → delete connection →
  sign-out).
- **SC-008**: `prefers-reduced-motion: reduce` removes all
  decorative animation on the landing surface and disables route
  transitions in the workspace.

## Assumptions

- Users have a GitHub account.
- Users have an existing Supabase project; the app does not create
  Supabase projects.
- The app is deployed behind HTTPS (NextAuth requires this); local
  dev uses `localhost`, which NextAuth treats as secure-enough.
- The app's own database is Postgres-compatible (Supabase, Neon, or
  self-hosted).
- v1 ships English only.
- Audit log retention is indefinite in v1 (operator may prune later).
