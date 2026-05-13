# Suparbase

> Auto-admin dashboard for any Supabase project. Paste your URL and an API key. We
> introspect your schema and hand you a working admin UI — tables, forms, foreign
> keys, the lot. No code. No deploy. No server.

[![Static SPA](https://img.shields.io/badge/runtime-static_SPA-0A0A0B?labelColor=B6FF3C)](#)
[![Bring your own Supabase](https://img.shields.io/badge/backend-BYO_Supabase-0A0A0B?labelColor=B6FF3C)](#)

## What this is

Suparbase is a client-only single-page application. You provide a Supabase
**project URL** and an **API key**. The app fetches your project's PostgREST
OpenAPI document, infers the schema, and renders:

- A **dashboard** with row counts per table.
- A **per-table data grid** with sort, search, and pagination, where foreign-key
  cells resolve to human-readable labels.
- A **detail / edit / create form** auto-built from each column's type:
  text → input, long text → textarea, integer → number, boolean → switch,
  timestamp → date-time picker, UUID → generator, JSON → JSON editor with
  validation, enum → select, foreign key → searchable reference picker.
- A **delete** flow with confirmation + 5-second undo.
- A **schema view** that lists every table and column with type, nullability,
  default, FK target, and column comments.
- A **settings** surface showing the connected project's host, key role, and a
  prominent **Disconnect** action.

Suparbase ships **no backend** of its own. Every request goes straight from your
browser to your Supabase host. Your API key never touches a third party.

## Quickstart

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Paste your project URL (e.g. `https://abcdefgh.supabase.co`) and an API key
from **Project Settings → API**. The anon key is recommended. The service-role
key works — you'll be warned and asked to type "I understand" first.

## Build & deploy

```bash
pnpm build        # → dist/
pnpm preview      # serve dist/ locally
```

`dist/` is a static bundle. Deploy anywhere:

```bash
vercel --prod ./dist
netlify deploy --prod --dir=dist
```

Recommended CSP for self-hosting:

```
default-src 'self';
connect-src 'self' https://*.supabase.co https://*.supabase.in;
img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
script-src 'self';
frame-ancestors 'none';
```

## Stack

- Vite 5 · React 18 · TypeScript 5
- Tailwind CSS 3 + Radix UI primitives
- `@supabase/supabase-js` v2 · `@tanstack/react-query` v5 · `@tanstack/react-table` v8
- `react-hook-form` v7 · `react-router-dom` v6
- `gsap` (connect screen only) · `sonner` (toasts) · `lucide-react` (icons)

## Security posture

- **Zero proxy**: requests are direct browser → your Supabase host. We assert at
  runtime that the host ends in `.supabase.co` / `.supabase.in`.
- **No key in logs**: a defensive redactor strips JWT-shaped substrings from any
  message before it reaches `console`.
- **Role detection**: the JWT `role` claim is decoded client-side; service-role
  keys force a typed-acknowledgement modal before the first network call.
- **Persistence opt-in**: credentials live in `sessionStorage` (this tab only)
  by default; **Remember on this device** moves them to `localStorage`.
- **Destructive actions** require explicit confirmation; deletes show a 5-second
  Undo via re-insert.

## Spec-Kit artifacts

This product was built spec-first using [Spec-Kit](https://github.com/github/spec-kit).
The full audit trail lives in [`specs/001-supabase-admin/`](specs/001-supabase-admin/):

| Document                                                       | What's in it                              |
|----------------------------------------------------------------|-------------------------------------------|
| [`spec.md`](specs/001-supabase-admin/spec.md)                  | User stories, FRs, edge cases, scope.     |
| [`plan.md`](specs/001-supabase-admin/plan.md)                  | Stack, constraints, structure decisions.  |
| [`research.md`](specs/001-supabase-admin/research.md)          | Phase-0 decision log with alternatives.   |
| [`data-model.md`](specs/001-supabase-admin/data-model.md)      | Schema, connection, query-cache shape.    |
| [`contracts/`](specs/001-supabase-admin/contracts/)            | Schema introspection, data access, routes.|
| [`quickstart.md`](specs/001-supabase-admin/quickstart.md)      | Dev / build / deploy / smoke checklist.   |
| [`tasks.md`](specs/001-supabase-admin/tasks.md)                | Task breakdown by user story.             |

The project's constitution lives at [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
and defines non-negotiables on performance, accessibility, the client-only
deployment model, and credential handling.

## Status

v0.1 — usable end-to-end against a real Supabase project. Out-of-scope for v1:
storage browser, SQL editor, auth user management, migrations / DDL.

## License

MIT.
