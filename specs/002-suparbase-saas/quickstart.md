# Quickstart

## Prerequisites

- Node.js 20 LTS or newer
- pnpm 9
- Postgres (any of):
  - Supabase free project · grab `DATABASE_URL` from Settings → Database
  - Neon free database
  - Local Docker: `docker run -d --name suparbase-pg -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres:16`
- A GitHub OAuth app (Settings → Developer settings → OAuth Apps):
  - Homepage URL: `http://localhost:3000`
  - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

## Configure

Copy `.env.example` to `.env.local` and fill in:

```
DATABASE_URL=postgres://...
AUTH_SECRET=<openssl rand -base64 32>
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
SUPARBASE_ENCRYPTION_KEY=<openssl rand -base64 32>
```

Generate `AUTH_SECRET` and `SUPARBASE_ENCRYPTION_KEY`:

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)"
echo "SUPARBASE_ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

## Install + migrate

```bash
pnpm install
pnpm db:push        # apply Drizzle schema to your DATABASE_URL
```

## Run

```bash
pnpm dev            # http://localhost:3000
```

1. Click "Sign in with GitHub": first run authorizes your OAuth app.
2. On `/connections`, click "New connection" and paste a Supabase
   project URL + an API key.
3. Click into the connection to land on the workspace dashboard.

## Build & deploy

```bash
pnpm typecheck
pnpm build
pnpm start
```

For Vercel:

```bash
vercel --prod
```

Set the same env vars in the Vercel project settings. The build is a
Next.js app, not a static export.

## Health endpoint

`GET /api/health` returns 200 if the database is reachable. Use it for
your platform's healthcheck.

## Smoke checklist

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` succeeds; bundle sizes within budget.
- [ ] Marketing landing renders without auth.
- [ ] `/signin` shows the GitHub button.
- [ ] Signing in lands on `/connections`.
- [ ] Creating a connection encrypts the key (verify the DB row's
      `encryptedKey` looks like binary garbage, NOT a JWT).
- [ ] The connection appears in the list.
- [ ] Clicking the connection lands on `/c/[id]` with the dashboard.
- [ ] Network tab: every PostgREST call targets `/api/v/[id]/...`,
      NOT `*.supabase.co`.
- [ ] Insert/update/delete a row; verify `audit_log` row appears.
- [ ] Delete a connection; verify the row is removed.
- [ ] Sign out; reload; `/connections` redirects to `/signin`.
- [ ] Mobile: hamburger nav works; tables list scrollable.
