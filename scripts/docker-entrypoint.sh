#!/bin/sh
# Suparbase app container entrypoint.
#
#  1. Wait (up to 30s) for the secrets files to appear in /secrets.
#     They are produced by the `bootstrap` compose service.
#  2. For every *_FILE env var pointing at a real file, export its
#     contents as the corresponding plain env var — but ONLY if the
#     plain env var is empty. Operator-supplied values always win.
#  3. Compose DATABASE_URL from the resolved POSTGRES_PASSWORD, unless
#     the operator already supplied a full DATABASE_URL.
#  4. Run pending Drizzle migrations (via the bundled migrator).
#  5. Exec the Next.js standalone server.

set -e

log()  { echo "[entrypoint] $*"; }
err()  { echo "[entrypoint] $*" >&2; }

dump_diagnostics() {
  log "==== diagnostics ===="
  log "uid:gid   = $(id -u):$(id -g)"
  log "cwd       = $(pwd)"
  if [ -d /secrets ]; then
    log "/secrets contents:"
    ls -la /secrets 2>&1 | sed 's/^/  /'
  else
    log "/secrets does not exist"
  fi
  log "env keys present (values redacted):"
  env | awk -F= '{print $1}' | sort | sed 's/^/  /'
  log "===================="
}

# Returns 0 if a value is now in $1, else 1.
resolve_one() {
  name="$1"
  file_var="${name}_FILE"

  # Indirect lookup, POSIX-safe.
  current=$(eval "printf '%s' \"\${$name:-}\"")
  if [ -n "$current" ]; then
    log "$name supplied via env"
    return 0
  fi

  file_path=$(eval "printf '%s' \"\${$file_var:-}\"")
  if [ -z "$file_path" ]; then
    log "$name not set; no $file_var configured either"
    return 1
  fi
  if [ ! -f "$file_path" ]; then
    log "$name not set; $file_path does not exist yet"
    return 1
  fi
  if [ ! -r "$file_path" ]; then
    err "$name file $file_path exists but is not readable by uid $(id -u). Check bootstrap permissions."
    return 1
  fi
  value=$(tr -d '\r\n' < "$file_path")
  if [ -z "$value" ]; then
    err "$name file $file_path is empty"
    return 1
  fi
  export "$name=$value"
  log "loaded $name from $file_path"
  return 0
}

# Wait up to 30s for every required secret to be either in the env or
# present as a readable file.
deadline=$(( $(date +%s) + 30 ))
while :; do
  missing=""
  for spec in POSTGRES_PASSWORD AUTH_SECRET SUPARBASE_ENCRYPTION_KEY; do
    if ! resolve_one "$spec" > /dev/null 2>&1; then
      missing="$missing $spec"
    fi
  done
  if [ -z "$missing" ]; then
    break
  fi
  now=$(date +%s)
  if [ "$now" -ge "$deadline" ]; then
    err "FATAL: missing secrets after 30s:$missing"
    dump_diagnostics
    exit 1
  fi
  log "waiting for secrets (still missing:$missing)"
  sleep 1
done

# Final, loud-logging resolution.
resolve_one POSTGRES_PASSWORD || true
resolve_one AUTH_SECRET || true
resolve_one SUPARBASE_ENCRYPTION_KEY || true

# Compose DATABASE_URL if not explicitly set.
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    err "FATAL: neither DATABASE_URL nor POSTGRES_PASSWORD is available."
    dump_diagnostics
    exit 1
  fi
  DB_HOST="${POSTGRES_HOST:-db}"
  DB_PORT="${POSTGRES_PORT:-5432}"
  DB_USER="${POSTGRES_USER:-postgres}"
  DB_NAME="${POSTGRES_DB:-suparbase}"
  DATABASE_URL="postgres://${DB_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  export DATABASE_URL
  log "composed DATABASE_URL=postgres://${DB_USER}:***@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

if [ -z "${AUTH_SECRET:-}" ]; then
  err "FATAL: AUTH_SECRET is not set and no secret file is mounted."
  dump_diagnostics
  exit 1
fi
if [ -z "${SUPARBASE_ENCRYPTION_KEY:-}" ]; then
  err "FATAL: SUPARBASE_ENCRYPTION_KEY is not set and no secret file is mounted."
  dump_diagnostics
  exit 1
fi

log "==> running migrations"
node dist/migrator.mjs

log "==> starting next on :${PORT:-3000}"
exec node server.js
