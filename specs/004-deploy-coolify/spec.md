# Feature Specification: One-click Coolify deploy

**Feature Branch**: `004-deploy-coolify`
**Created**: 2026-05-13
**Status**: Draft
**Input**: User description: "We will host on Coolify. Use Supabase Postgres docker for the app DB, set up a proper docker-compose, link everything, and use open-source tooling. The only thing I should need to type in Coolify is the keys you don't have (GitHub OAuth, the encryption key, OpenRouter is per-user)."

## User Scenarios & Testing

### User Story 1 — Deploy in three minutes on Coolify (P1)

A Coolify operator points the project at this repo, sets six environment
variables, and hits Deploy.

**Acceptance**:
1. The operator selects "Docker Compose" as the deployment type and
   pastes the path to `docker-compose.yaml` (which lives at the repo root).
2. Coolify reads the compose file and surfaces six required env vars
   (`AUTH_SECRET`, `AUTH_URL`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`,
   `SUPARBASE_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`).
3. Coolify offers a "Generate random" option for `AUTH_SECRET`,
   `SUPARBASE_ENCRYPTION_KEY`, and `POSTGRES_PASSWORD`. The operator
   accepts those defaults. They paste GitHub OAuth credentials and
   their app's public URL.
4. Coolify builds the image, starts `db`, waits for its healthcheck,
   then starts `app`. The app's entrypoint runs all Drizzle migrations
   on the empty database, then `next start` takes over.
5. Coolify's reverse proxy routes the app's port to the operator's
   chosen domain. Hitting the domain yields the marketing landing page.

### User Story 2 — Database persists across redeploys (P1)

The Postgres data volume survives container restarts and re-deploys.

**Acceptance**:
1. The operator creates a connection, signs in, and saves an
   OpenRouter key.
2. The operator triggers a redeploy from Coolify.
3. After the new app container is healthy, the connection list still
   shows the saved connection (its encrypted key still decrypts);
   the AI settings still show the saved OpenRouter key.

### User Story 3 — Auto-composed DATABASE_URL (P2)

The operator never sees or types a Postgres connection string.
`DATABASE_URL` is composed inside docker-compose from
`POSTGRES_PASSWORD` and the internal service name.

**Acceptance**:
1. The `app` service has `DATABASE_URL` set in `environment:` as
   `postgres://postgres:${POSTGRES_PASSWORD}@db:5432/suparbase`.
2. Removing `DATABASE_URL` from the Coolify UI does not break the
   deploy.

## Functional Requirements

- **FR-001**: A `Dockerfile` MUST produce a minimal production image
  using Next.js standalone output. The runtime image MUST NOT include
  dev dependencies or source maps.
- **FR-002**: A `docker-compose.yaml` at the repo root MUST declare
  exactly two services: `db` (Supabase Postgres) and `app` (Next.js).
- **FR-003**: The `app` service MUST `depends_on: { db: { condition: service_healthy }}`
  so the Postgres container is reachable before migrations run.
- **FR-004**: The `app` container's entrypoint MUST run Drizzle
  migrations (`drizzle/*.sql`) against `DATABASE_URL` before invoking
  `next start`. A failed migration MUST cause the container to exit
  non-zero (Coolify will mark the deploy failed).
- **FR-005**: The Postgres `data` directory MUST be persisted in a
  named volume so a redeploy does not wipe user state.
- **FR-006**: The `app` service MUST expose port 3000 (Coolify's
  reverse proxy routes external traffic). The compose file MUST NOT
  hard-bind a host port.
- **FR-007**: A `/api/health` endpoint MUST return 200 within 30s of
  the app starting; the Docker healthcheck MUST be configured to
  poll it.
- **FR-008**: `.env.example` MUST list exactly the env vars the
  operator needs to set in Coolify. `DATABASE_URL` MUST NOT appear
  there — it is composed.
- **FR-009**: A `.dockerignore` MUST exclude `.next`, `node_modules`,
  `.git`, local env files, and spec-kit folders so the build context
  stays minimal.
- **FR-010**: The image MUST work with Node 20 LTS and run as a
  non-root user.

## Success Criteria

- **SC-001**: `docker compose build` on a clean machine completes in
  under 4 minutes on a typical broadband connection (most of the time
  is pnpm install).
- **SC-002**: First boot (db + migrations + app) is healthy within
  60 seconds on commodity Coolify hardware.
- **SC-003**: The runtime image is ≤ 250 MB uncompressed (smaller via
  standalone).
- **SC-004**: A fresh operator can complete the deploy by setting six
  env vars in Coolify, three of which are auto-generated.

## Out of scope (this feature)

- Production observability stack (Prometheus, Loki). Coolify's logs
  view is sufficient for v1.
- Horizontal scaling / multiple replicas (in-memory rate limiter is
  process-local).
- Postgres backups beyond the volume itself; operators should use
  Coolify's snapshot feature.
- Embedded Supabase Studio / Kong / GoTrue (we only use Supabase's
  Postgres image as the app DB; we are NOT bundling the full Supabase
  stack).
