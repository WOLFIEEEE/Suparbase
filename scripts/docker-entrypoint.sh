#!/bin/sh
set -e

# Run pending Drizzle migrations against DATABASE_URL.
echo "==> running migrations"
node scripts/migrate.mjs

# Hand off to Next.js. `server.js` is the entrypoint produced by the
# Next.js standalone build.
echo "==> starting next on :${PORT:-3000}"
exec node server.js
