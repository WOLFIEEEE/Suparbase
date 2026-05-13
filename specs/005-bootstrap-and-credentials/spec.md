# Feature Specification: Self-bootstrap & credentials auth

**Feature Branch**: `005-bootstrap-and-credentials`
**Created**: 2026-05-13
**Status**: Draft
**Input**: User description: "Generate POSTGRES_PASSWORD, AUTH_SECRET, and
SUPARBASE_ENCRYPTION_KEY automatically (don't make me type them). Default
AUTH_URL to suparbase.com. Make GitHub auth optional — normal email +
password signup/login should still work."

## User Scenarios & Testing

### User Story 1 — Deploy with zero secrets typed (P1)

Operator deploys on Coolify, leaves `POSTGRES_PASSWORD`, `AUTH_SECRET`,
and `SUPARBASE_ENCRYPTION_KEY` blank, and the deploy still succeeds with
cryptographically strong secrets.

**Acceptance**:
1. On first boot, a `bootstrap` init container reads `/dev/urandom`
   into three files inside a Docker volume (`suparbase_secrets`):
   `postgres_password`, `auth_secret`, `encryption_key`. Each is 32
   bytes of base64.
2. The `db` service starts using `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password`.
3. The `app` service's entrypoint loads each `*_FILE` value into the
   corresponding environment variable before launching Next.js.
4. On the second boot, the bootstrap step sees existing files and is
   a no-op — the same secrets are reused, so previously encrypted rows
   still decrypt correctly.
5. If the operator does set a value in Coolify's UI, that value wins
   (the entrypoint only falls back to the file when the env var is
   empty).

### User Story 2 — Default domain is suparbase.com (P2)

`AUTH_URL` defaults to `https://suparbase.com` in `docker-compose.yaml`.
Operators on other domains override the env var; Coolify auto-populates
it from the assigned domain.

**Acceptance**:
1. With no `AUTH_URL` override, the running app uses `https://suparbase.com`
   as its public origin (e.g. the signin redirect target and the
   marketing OpenGraph URL).
2. With `AUTH_URL=https://demo.example.com` in Coolify, the app uses
   that origin everywhere.

### User Story 3 — Sign up with email + password (P1)

A visitor signs up for a new Suparbase account using email + password.
The GitHub OAuth button is shown only when the operator has provided
GitHub OAuth credentials.

**Acceptance**:
1. The `/signup` page accepts: name, email (validated), password
   (minimum 12 characters). On submit, the user row is created with a
   bcrypt-hashed password, an email-uniqueness violation surfaces as
   a field-level error, and the user is signed in immediately.
2. The `/signin` page accepts email + password and signs in via
   NextAuth's Credentials provider. Wrong password yields a generic
   "Invalid email or password" message (no enumeration).
3. The "Continue with GitHub" button on `/signin` is rendered only if
   the server has both `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`
   configured. Otherwise the page shows only the email+password form.
4. Existing OAuth flow continues to work when configured.

### User Story 4 — Operator awareness of vault key (P2)

Operators who let the system auto-generate `SUPARBASE_ENCRYPTION_KEY`
are warned that losing the secrets volume = losing all encrypted
credentials.

**Acceptance**:
1. README "Coolify deploy" section calls out the volume backup
   requirement.
2. Settings (`/settings/ai`) shows a faint hint that the encryption
   key is self-generated when the env var was not provided
   (optional — surface only if cheap to detect).

## Functional Requirements

### Bootstrap & secrets

- **FR-001**: A `bootstrap` init service MUST run before `db` and `app`,
  writing missing secret files into a shared volume with 0600 perms.
- **FR-002**: The `app` entrypoint MUST load each `*_FILE` env var,
  read the file, and `export` the corresponding variable BEFORE invoking
  the migrator or the Next.js server.
- **FR-003**: `DATABASE_URL` MUST be composed at runtime from the
  resolved `POSTGRES_PASSWORD`; the compose file uses a placeholder.
- **FR-004**: Explicit env-var values from Coolify MUST take precedence
  over file fallbacks.
- **FR-005**: The vault key file MUST persist in the same docker volume
  used for secrets. The volume MUST NOT be on the ephemeral container
  layer.

### Auth

- **FR-010**: NextAuth MUST use the `jwt` session strategy (a switch
  from v0.2's `database` strategy) so the Credentials provider can be
  composed with database-backed users.
- **FR-011**: A Credentials provider MUST accept `{ email, password }`
  and verify against the `password_hash` column on `users`.
- **FR-012**: A `password_hash` column MUST be added to `users`
  (nullable — existing OAuth users have no password).
- **FR-013**: `POST /api/auth/signup` MUST: validate body (email,
  password ≥ 12 chars, optional name), check email uniqueness, hash
  with bcrypt cost 12, insert a `users` row, then return the session.
- **FR-014**: The GitHub provider MUST be configured conditionally:
  if `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are both set; otherwise
  it is omitted from the providers array.
- **FR-015**: The `/signin` page MUST render only the providers the
  server has configured.
- **FR-016**: Password storage MUST use bcrypt (work factor 12) via
  `bcryptjs` (no native compilation). Plaintext passwords MUST NOT
  appear in any log or audit row.

### Cross-cutting

- **FR-020**: `AUTH_URL` MUST default to `https://suparbase.com` in
  `docker-compose.yaml`.
- **FR-021**: The redactor MUST recognize bcrypt hash prefixes
  (`$2a$`, `$2b$`, `$2y$`) and redact them from any logged message.
- **FR-022**: Sign-up rate-limiting MUST be applied: 5 signups / hour /
  IP (in-memory token bucket, same module as the proxy).

## Success Criteria

- **SC-001**: A new Coolify deploy with NO env vars typed reaches a
  healthy state in ≤ 60s, with three secrets persisted in the
  `suparbase_secrets` volume.
- **SC-002**: A user can sign up, sign in, sign out, and re-sign-in
  using email + password without GitHub OAuth configured.
- **SC-003**: A user with GitHub OAuth configured sees both options on
  `/signin` and can use either; mixing accounts (same email via OAuth
  vs Credentials) follows NextAuth's default linking rules (OAuth wins
  for that email unless `OAuthAccountNotLinked` triggers).
- **SC-004**: A redeploy preserves auto-generated secrets; previously
  saved Supabase API keys still decrypt.
- **SC-005**: Bundle delta vs v0.4: ≤ +10 KB gz (one extra form,
  one extra page).

## Out of scope (this feature)

- Email verification / magic links (would require an SMTP provider).
- Password reset by email (same dependency).
- Multi-factor auth.
- Social providers beyond GitHub.
- "Forgot password" flow (the operator can manually clear `password_hash`
  via SQL for now).
- OIDC / SAML / enterprise SSO.
