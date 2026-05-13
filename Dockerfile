# syntax=docker/dockerfile:1.7

# ---------- deps ----------
# Install all (including dev) dependencies once; cache them.
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile


# ---------- builder ----------
# Build Next.js (standalone) AND bundle the migrator into a single
# self-contained JS file. The runner stage then needs zero extra deps.
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@9.15.4 --activate

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholders so `next build` can complete without real
# secrets. Real values are injected at runtime via the docker-compose
# `environment:` block.
ENV DATABASE_URL=postgres://placeholder \
    AUTH_SECRET=build-time-placeholder-not-a-real-secret \
    AUTH_URL=http://localhost:3000 \
    AUTH_GITHUB_ID=build-time-placeholder \
    AUTH_GITHUB_SECRET=build-time-placeholder \
    SUPARBASE_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

# `pnpm run build` chains `next build` AND `pnpm build:migrator`
# (esbuild → dist/migrator.mjs — ~250 KB, fully self-contained).
RUN pnpm run build


# ---------- runner ----------
# Minimal runtime image. No npm install: Next's standalone output
# carries every dep its server code needs, and the migrator is a single
# bundled file with drizzle-orm + postgres-js baked in.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user.
RUN addgroup -g 1001 -S nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# wget is used by the Docker HEALTHCHECK; keep it lean.
RUN apk add --no-cache wget

# Next.js standalone output: server + the exact node_modules subset its
# server chunks need.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Bundled migrator + the SQL migrations it applies.
COPY --from=builder --chown=nextjs:nodejs /app/dist/migrator.mjs ./dist/migrator.mjs
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

# Entrypoint script (POSIX sh, busybox-compatible).
COPY --from=builder --chown=nextjs:nodejs /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
