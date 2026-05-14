# RLS policy debugger (v1.2)

## Goal
Inspect every Row-Level-Security policy on the project and simulate
requests as anon / authenticated / service_role users to see which
verbs each policy actually allows.

## New credential
RLS catalogs aren't exposed via PostgREST when called with an
anon/authenticated key. We added an optional `encryptedPostgresUrl`
column on `connections` (migration `0005_silent_hardball`) encrypted
with the same vault key as the PostgREST credential.

UI: the RLS page detects when no Postgres URL is set and shows a
single-input setup card. `PUT /api/connections/[id]/postgres-url`
stores or clears it. The URL is never returned over the wire — only
`hasPostgresUrl: boolean` is exposed on the connection summary.

## Server
- `src/server/proxy/postgres.ts`
  - `listPolicies(conn)` reads `pg_policies` for `public`.
  - `listRlsStatus(conn)` reads `pg_class` for RLS-enabled flags +
    per-table policy counts.
  - `withRlsSimulation(conn, {role, claims}, fn)` opens a one-shot
    connection, starts a transaction, sets `SET LOCAL ROLE` (allow-listed
    against {anon, authenticated, service_role, postgres}), seeds
    `request.jwt.claims` and `request.jwt.claim.role`, runs `fn`, and
    always rolls back so no row data is touched.

## API
- `GET  /api/v/[id]/rls/policies` →
  `{policies: PgPolicy[], status: {table, rlsEnabled, policyCount}[]}`
- `POST /api/v/[id]/rls/simulate` →
  `{results: VerbResult[]}` — runs SELECT (count), INSERT (DEFAULT VALUES),
  UPDATE (`SET pk = pk` to test visibility), and DELETE (`WHERE FALSE`),
  then rolls back. Each verb returns `{allowed, rowsVisible?, message?}`.

## UX
- New `RLS` item in the workspace sidebar.
- Page splits into a Policies pane and a Simulate pane.
- Policies pane groups by table. Each table shows whether RLS is on,
  the policy count, then each policy with command + roles + USING /
  WITH CHECK clauses formatted as code blocks.
- Simulator pane lets you pick a table, a role, and a free-form
  `request.jwt.claims` JSON. Run → a strip of verb pills shows
  allow/deny + (for SELECT/UPDATE) the visible row count.

## Out of scope (v1)
- Editing or proposing new policies.
- Multi-schema browsing.
- Simulating writes with custom payloads.
- pg_hba / network-level checks.
