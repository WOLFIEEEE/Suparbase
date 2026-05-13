#!/bin/sh
# Suparbase app container entrypoint.
#
#  1. For every *_FILE env var pointing to a real file, export its
#     contents as the corresponding plain env var — but ONLY if the
#     plain env var is empty. Operator-supplied values always win.
#  2. Compose DATABASE_URL from the resolved POSTGRES_PASSWORD, unless
#     the operator already supplied a full DATABASE_URL.
#  3. Run pending Drizzle migrations.
#  4. Exec the Next.js standalone server.

set -e

# Load `<NAME>_FILE` → `<NAME>` when NAME is empty and the file exists.
load_from_file() {
  name="$1"
  file_var="${name}_FILE"
  # POSIX-safe indirect lookup
  current=$(eval "printf '%s' \"\${$name:-}\"")
  if [ -n "$current" ]; then
    return 0
  fi
  file_path=$(eval "printf '%s' \"\${$file_var:-}\"")
  if [ -z "$file_path" ] || [ ! -f "$file_path" ]; then
    return 0
  fi
  value=$(cat "$file_path" | tr -d '\r\n')
  export "$name=$value"
  echo "[entrypoint] loaded $name from $file_path"
}

load_from_file POSTGRES_PASSWORD
load_from_file AUTH_SECRET
load_from_file SUPARBASE_ENCRYPTION_KEY

# Compose DATABASE_URL if not explicitly set.
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "[entrypoint] FATAL: neither DATABASE_URL nor POSTGRES_PASSWORD is available." >&2
    exit 1
  fi
  DB_HOST="${POSTGRES_HOST:-db}"
  DB_PORT="${POSTGRES_PORT:-5432}"
  DB_USER="${POSTGRES_USER:-postgres}"
  DB_NAME="${POSTGRES_DB:-suparbase}"
  DATABASE_URL="postgres://${DB_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  export DATABASE_URL
  echo "[entrypoint] composed DATABASE_URL=postgres://${DB_USER}:***@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

if [ -z "${AUTH_SECRET:-}" ]; then
  echo "[entrypoint] FATAL: AUTH_SECRET is not set and no secret file is mounted." >&2
  exit 1
fi
if [ -z "${SUPARBASE_ENCRYPTION_KEY:-}" ]; then
  echo "[entrypoint] FATAL: SUPARBASE_ENCRYPTION_KEY is not set and no secret file is mounted." >&2
  exit 1
fi

echo "==> running migrations"
node dist/migrator.mjs

echo "==> starting next on :${PORT:-3000}"
exec node server.js
