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
# Build the Next.js standalone bundle.
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat \
 && corepack enable \
 && corepack prepare pnpm@9.15.4 --activate

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time placeholders so `next build` can complete without real secrets.
# Real values are injected at runtime via docker-compose `environment:`.
ENV DATABASE_URL=postgres://placeholder \
    AUTH_SECRET=build-time-placeholder-not-a-real-secret \
    AUTH_URL=http://localhost:3000 \
    AUTH_GITHUB_ID=build-time-placeholder \
    AUTH_GITHUB_SECRET=build-time-placeholder \
    SUPARBASE_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

RUN pnpm run build


# ---------- runner ----------
# Minimal runtime image with only what the standalone server needs.
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

# Next.js standalone output: the server, only the node_modules it actually
# needs, plus the .next/static assets.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrator + entrypoint + the SQL migrations themselves.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# The migrator imports from drizzle-orm/postgres-js, which lives under
# node_modules. The standalone trace doesn't keep those modules in the
# root node_modules tree, so install the minimal runtime set the migrator
# needs separately.
RUN npm install --omit=dev --no-audit --no-fund \
      drizzle-orm@^0.36.4 postgres@^3.4.5 \
 && chown -R nextjs:nodejs /app/node_modules

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
