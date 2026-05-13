# Quickstart

## Prerequisites

- Node.js 20 LTS or newer
- pnpm 9 (preferred) or npm 10
- A Supabase project (or use https://supabase.com/dashboard to spin one up
  in <60s).

## Install & run

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Paste your project URL (looks like `https://abcdefgh.supabase.co`) and an API
key from **Project Settings → API**. The anon key is recommended; the
service-role key works but the app will warn before connecting.

## Type-check & build

```bash
pnpm typecheck
pnpm build        # tsc + vite build → dist/
pnpm preview      # serve dist/ on http://localhost:4173
```

## Bundle budget verification

After `pnpm build`:

```bash
gzip -c dist/assets/index-*.js | wc -c        # should be ≤ 220KB for landing chunk
gzip -c dist/assets/index-*.css | wc -c       # should be ≤ 80KB
```

(Workspace chunks load on-demand; their gzip sizes should keep total at any
first paint ≤ 480KB.)

## Deploy

`dist/` is a static bundle. Drop on any static host:

```bash
vercel --prod ./dist
netlify deploy --prod --dir=dist
```

## Recommended Content-Security-Policy

When self-hosting, set:

```
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://*.supabase.co https://*.supabase.in;
  img-src 'self' data: blob:;
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  script-src 'self';
  frame-ancestors 'none';
```

This restricts outbound API calls to user Supabase projects only.

## Smoke checklist (manual, run on every PR)

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` succeeds; bundle sizes within budget.
- [ ] Connect screen renders; "Connect" disabled until URL + key fields are
      non-empty and URL passes regex.
- [ ] Connect with a real Supabase URL + anon key → schema introspected,
      router lands on `/dashboard`.
- [ ] Service-role JWT triggers warning modal before network call.
- [ ] Dashboard shows tables with row counts.
- [ ] `/tables/:name` lists rows, paginates, sorts, searches.
- [ ] Row detail opens; FK columns resolve to label values.
- [ ] Create row → form renders type-appropriate inputs; submit round-trips.
- [ ] Edit row → values pre-fill; submit updates; toast confirms.
- [ ] Delete row → confirmation; row disappears; undo toast restores.
- [ ] Schema view lists every table and column.
- [ ] Settings → Disconnect clears credentials, returns to `/`.
- [ ] Reload page with "Remember on this device" → bypasses connect.
- [ ] Reload without that opt-in → returns to connect screen.
- [ ] `prefers-reduced-motion: reduce` → landing animations off.
- [ ] Keyboard-only happy path completes with visible focus.
- [ ] DevTools console clean (no errors, no key leaks).
