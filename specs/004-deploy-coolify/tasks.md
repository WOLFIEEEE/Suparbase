# Tasks: Coolify deployment

- [ ] T001 Enable Next.js standalone output (`next.config.ts`); verify build still passes.
- [ ] T002 Write `scripts/migrate.mjs` using `drizzle-orm/postgres-js/migrator`.
- [ ] T003 Write `scripts/docker-entrypoint.sh`: run migrate, then exec `node server.js`.
- [ ] T004 Write `Dockerfile`: deps / builder / runner stages; non-root; healthcheck wrapper via Docker Compose only.
- [ ] T005 Write `.dockerignore`.
- [ ] T006 Write `docker-compose.yaml`: `db` + `app`, named volume, depends_on with healthchecks, DATABASE_URL composed.
- [ ] T007 Update `.env.example` to only list Coolify-facing vars.
- [ ] T008 Add a Coolify deploy section to README.
- [ ] T009 Build the image locally (`docker compose build`) and verify it runs against an ephemeral Postgres (`docker compose up`).
- [ ] T010 Commit + push branch.
