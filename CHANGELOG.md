# Changelog

All notable changes between Suparbase versions. Each version corresponds
to a Spec-Kit feature directory under [`specs/`](specs/) and a git tag.

## v1.1.0 — 2026-05-14 — More archetypes

Tag: `v1.1.0` · Spec: [`specs/010-more-archetypes/`](specs/010-more-archetypes/)

The archetype system was deliberately narrow in v1.0 — Users, Content, Logs,
and a Generic fallback. v1.1 widens the taxonomy without changing the
mechanism: three new categories, each with a dedicated list + detail view,
each automatically applied to any matching table from the AI analysis (or
heuristic fallback) — no per-schema configuration required.

- **Commerce archetype.** Orders, invoices, transactions, payments,
  charges, receipts, carts, checkouts. List view (`CommerceAdmin`)
  surfaces order number + customer + status pill + money column at the
  end of the row, with an on-page revenue tally in the stat strip.
  Detail view (`CommerceDetail`) renders the total at display size in a
  hero card alongside a four-step pipeline (Placed → Paid → Shipped →
  Delivered) driven from the canonical status vocabulary; terminal
  states (refunded / cancelled / failed) collapse the pipeline to a
  single note. Money columns are formatted via `Intl.NumberFormat` with
  the table's `currency` column when present; `_cents` columns divide
  by 100 automatically.
- **Tasks archetype.** Tickets, issues, todos, cards, jobs, reminders.
  List view (`TasksAdmin`) groups rows by canonical status bucket
  (To do / In progress / Done / Blocked / Other) collapsing synonyms
  like `in_progress` / `doing` / `active` / `started` / `review` into a
  single column; each row shows title + assignee + priority + due date
  with overdue surfaced in red on the detail page. Detail view
  (`TaskDetail`) renders the title with bucket icon, status pill,
  priority chip, assignee (linkable when the FK is set), and a body
  block from `description` / `details` / `notes`.
- **Messages archetype.** Comments, threads, conversations, replies,
  notes. List view (`MessagesAdmin`) renders each row as a compact chat
  card with author + body snippet + reply badge (when a thread/parent FK
  is set), with on-page reply count + unique author count in the stat
  strip. Detail view (`MessageDetail`) is a single chat bubble with
  author link (when the FK is set) + relative time + "in reply to"
  pointer when applicable.
- **Classifier extensions.** `TableCategory` enum widened to seven
  values; OpenRouter prompt + Zod response schema both teach the model
  the new categories with concrete signals (money + status →
  `commerce`; status + assignee FK → `tasks`; body + author FK +
  thread FK + no slug → `messages`). Heuristic fallback updated to
  match the same shapes so first paint never waits on the model.
- **Workspace surfaces.** `TableTile`, `CommandPalette`, and
  `PresetSwitcher` all carry icons + labels for the three new
  categories. `groupTablesByArchetype` emits the new buckets so the
  Tables page renders them as their own sections ("Commerce",
  "Workflow", "Conversations") under the existing disclosure pattern.
- No new dependencies. Bundle: largest authenticated route
  (`/c/[id]/tables/[name]/new`) stays at 186 KB First Load JS — well
  under the 520 KB gz budget. Typecheck + `next build` both green.

## v1.0.1 — 2026-05-14 — Landing polish

Tag: `v1.0.1`

A focused polish pass on the unauthenticated landing page. Everything in
v1.0.0 unchanged; this is `/` only.

- **Hero animation rewrite.** Word-by-word mask-reveal on the headline
  (proper translate-from-below clip, not just opacity fade). Each word
  starts at `yPercent: 115` and rises into its `overflow-hidden` mask
  with `power4.out` easing + stagger; the accent line ("Supabase
  project.") is followed by a terminal caret that blinks — visual cue
  that this is software, not a brochure.
- **Product preview cards** dealt in below the CTAs with a `back.out`
  ease + slight rotation that settles. The three cards mirror the
  actual archetypes from the product (Users / Content / Logs) so the
  user sees exactly what they'll get the moment they sign in — bridges
  marketing → product without screenshots. Each carries one subtle
  live signal: the Users status pulses; the Logs timestamp ticks
  "12s → 13s → … → 59s → 12s" in real time. Both honour
  `prefers-reduced-motion`.
- **Surrounding layout.** Replaced the forbidden "three-card hero
  grid" (Constitution Principle III) with a numbered vertical list
  paired with a sticky-feeling headline column. The "Why server-side"
  block becomes a single surface card with five concrete promises and
  a Try-it / Self-host CTA pair. Header gains a GitHub link; footer
  shows `v1.0`.
- No new dependencies. Landing bundle: 135 KB → 144 KB First Load JS
  (+9 KB), entirely from the new product preview cards. Well under
  the 520 KB gz budget.

## v1.0.0 — 2026-05-14 — Polished release

Tag: `v1.0.0` · Spec: [`specs/008-v1-polish/`](specs/008-v1-polish/)

The GA release. Closes the remaining v0.7 backlog (saved views, filter
chips), pulls the v0.6 visual language down to every previously
unpolished surface, and unifies typography into a single professional
sans-serif family.

- Constitution **v3.2.0 → v3.3.0**: Principle III (Anti-AI-Slop Design)
  expanded to codify the v1.0 typography baseline — unified Inter
  Variable for body + display with heavier weight + tighter tracking on
  the display utility. No NON-NEGOTIABLE relaxed.
- **Typography unified**. Dropped Fraunces (serif) entirely; the
  `font-display` utility now resolves to Inter Variable at 650–700
  weight with tighter tracking. One font family across the entire app
  except JetBrains Mono for code/IDs. One fewer font family loaded at
  first paint.
- **Generic admin lift**. `TableListView` rebuilt: PageHeader chrome,
  stat tiles, row cards (not HTML `<table>`), BulkBar + ExportMenu +
  ImportPanel mounted, click-row → detail page (no drawer). New
  `GenericDetail.tsx` mirrors UserDetail's hero + sectioned identity +
  Linked-records sidebar for every non-archetype row. The old
  `TableRowView`, `DataGrid`, `DataGridToolbar`, and `RowDrawer`
  components are deleted — every list/detail page now uses the same
  visual language regardless of archetype.
- **Schema view rebuild**. The `/c/[id]/schema` page now uses
  `PageHeader` chrome, archetype groupings (People / Library /
  Activity / Everything else) via the existing `groupTablesByArchetype`
  helper, expandable `<details>` per table revealing columns grouped
  into Identifiers / Fields / Metadata, FK chips that link to the
  referenced table, and a System tables disclosure.
- **Connection flows polish**. `ConnectionList` cards redesigned:
  database icon, role chip, last-used relative time, hover-revealed
  action menu, whole-card click navigates to the workspace. The
  new-connection page wraps `ConnectionForm` in `PageHeader` with a
  "Paste from Supabase dashboard" eyebrow. `ConnectionSettings`
  reorganized into Identity / Security / Danger Zone surface cards.
- **Saved views (US5 from v0.7)**. New `saved_views` migration shipped
  in v0.7 MVP is now wired end-to-end: `GET / POST / PATCH / DELETE
  /api/views` routes, `useSavedViews` / `useCreateView` / `useUpdateView`
  / `useDeleteView` hooks, and a `ViewTabs` component mounted in
  `PageHeader`'s tabs slot on every list page. Views capture the
  current search + filter + sort and apply via a single URL push.
  Capped at 5 custom views per (user, connection, table).
- **Filter chips (US6 from v0.7)**. New `FilterBar` + `FilterPopover`
  + `FilterChip` components. Click "+ Filter" → pick column → pick
  operator → enter value → chip appears. Multiple chips combine with
  AND. Removing a chip narrows the URL. Operators are type-aware via
  `OPERATORS_FOR_TYPE`. The URL is the canonical state; `listRows` now
  accepts `filters?: ChipSpec[]` and translates them to PostgREST
  filter params under the existing proxy.
- **Settings + new-row + sign-in/up** previously partially polished now
  also use `PageHeader` chrome end-to-end.
- **v0.7 backlog status**: US5 (saved views) ✓ shipped. US6 (filter
  chips) ✓ shipped. **US4 (inline cell editing) deferred to v1.1** —
  the existing click-row → detail page → Edit flow still covers the
  use case; inline editing requires invasive changes to row-card
  layouts that would extend this release beyond its scope.
- Removed `@fontsource-variable/fraunces` dependency.
- Removed dead files: `src/components/workspace/TableRowView.tsx`,
  `src/components/data/DataGrid.tsx`,
  `src/components/data/DataGridToolbar.tsx`,
  `src/components/row/RowDrawer.tsx`, and the orphan
  `src/index.css` (vestigial from the v0.1 Vite SPA era).

## v0.6.0 — 2026-05-13 — Product workspace

Tag: `v0.6.0` · Spec: [`specs/006-product-workspace/`](specs/006-product-workspace/)

A coherent visual + UX overhaul: every workspace surface now matches the
Users archetype shipped in v0.5.1. The app reads as a product, not a
database admin. No schema changes; no new dependencies.

- **Dashboard rewrite** ([src/components/workspace/Dashboard.tsx](src/components/workspace/Dashboard.tsx)).
  Title is the connection's friendly name; hostname is demoted to subtitle.
  Hero stat strip with archetype-derived tiles (Audience / Library /
  Activity / Other tables). Archetype-grouped table sections. A "Recent
  activity" sidebar reads from `audit_log` via a new authenticated route.
  System tables collapse behind a disclosure.
- **Tables list rewrite** ([TablesList.tsx](src/components/workspace/TablesList.tsx)).
  Archetype groups (People / Library / Activity / Everything else); a
  search input filters every section at once; system tables behind a
  disclosure; uses the same `PageHeader` chrome as every other page.
- **Content archetype rebuilt** ([ContentAdmin.tsx](src/components/presets/ContentAdmin.tsx),
  [ContentDetail.tsx](src/components/presets/ContentDetail.tsx)). CMS-style
  row cards (title / status pill / author / published-at). Click → real
  detail page with title hero, body rendered as wrapped readable text,
  and a Linked-records sidebar. Drawer-as-detail pattern removed.
- **Logs archetype rebuilt** ([LogsAdmin.tsx](src/components/presets/LogsAdmin.tsx),
  [LogDetail.tsx](src/components/presets/LogDetail.tsx)). Time-bucketed
  event stream (Today / Yesterday / This week / Earlier). jsonb payloads
  collapse to one-line previews, click-to-expand. Detail page leads with
  the timestamp and pretty-prints the payload.
- **Command palette** ([CommandPalette.tsx](src/components/workspace/CommandPalette.tsx)).
  Cmd/Ctrl+K from anywhere in the workspace. Indexes connections,
  tables (with AI display names), pages, settings, and global actions
  (Toggle theme, Run AI analysis, Sign out). Lazy-loads its index on
  first open — the dialog appears instantly. Built on the existing
  cmdk + Radix Dialog primitives, no new deps.
- **Theme toggle** ([ThemeToggle.tsx](src/components/workspace/ThemeToggle.tsx),
  [src/lib/theme/](src/lib/theme/)). Topbar button switches between
  light and dark; preference persists in a `suparbase-theme` cookie
  readable by the server in [`app/layout.tsx`](src/app/layout.tsx) so
  initial paint matches — no flash on reload. Defaults to OS
  `prefers-color-scheme` when no preference is set. Full WCAG-AA light
  palette added to [globals.css](src/app/globals.css).
- **Sidebar polish** ([Sidebar.tsx](src/components/workspace/Sidebar.tsx)).
  Inline counts on Tables and Schema, accent-tinted active state with a
  left-edge indicator, AI footer link shows last-used model + token
  total when an analysis is cached.
- **New API route**: `GET /api/v/[id]/audit/recent?limit=10` — reads
  the user's own recent writes for a single connection. Connection
  ownership verified before any DB read; rate-limited under a new
  `checkReadRate` bucket (240/min/user). Contract:
  [audit-recent.md](specs/006-product-workspace/contracts/audit-recent.md).
- **AI analysis extended in v0.5.1** (pulled into the v0.6 release):
  `TableAnalysis` now carries `primary { titleColumn, subtitleColumn,
  avatarColumn, badgeColumn }`, `hiddenColumns`, and `relations`. The
  AI prompt asks for these explicitly; heuristic fallback fills them
  too. Every preset in this release reads them.
- `RowPresetRouter` dispatches `users` → `UserDetail`, `content` →
  `ContentDetail`, `logs` → `LogDetail`; everything else falls through
  to the existing `TableRowView`. The drawer-as-detail pattern is gone
  from every archetype (the drawer module still exists for the generic
  grid fallback).
- Bundle measurement: largest authenticated first-paint payload is
  `/c/[id]/tables/[name]/[pk]` at 189 KB First Load JS — well under
  the Constitution's 520 KB gz budget.
- Deletes the now-unused `src/components/presets/shared/PresetHeader.tsx`
  in favour of the shared `PageHeader` (Principle VI — no abstraction
  without a second caller).
- Constitution **v3.2.0 unchanged**: no new principle needed.

## v0.5.0 — 2026-05-13 — Self-bootstrap & email/password auth

Tag: `v0.5.0` · Spec: [`specs/005-bootstrap-and-credentials/`](specs/005-bootstrap-and-credentials/)

- Constitution **v3.1.0 → v3.2.0**: Principle VII clarified —
  auto-generated vault keys are permitted iff they persist with the
  data they encrypt and the operator is warned via README.
- **Self-bootstrap secrets**: a one-shot `bootstrap` Alpine container
  writes `postgres_password`, `auth_secret`, and `encryption_key`
  into a shared Docker volume on first deploy. `db` reads its
  password via `POSTGRES_PASSWORD_FILE`; the app entrypoint reads
  each `*_FILE` into env. Coolify deploy now requires **zero** env
  vars (GitHub OAuth remains optional).
- **Email + password auth**: NextAuth's Credentials provider with
  bcryptjs (cost 12). New `/signup` page, new `/api/auth/signup`
  route (rate-limited 5/hour/IP), `password_hash` column on `users`.
- **GitHub OAuth becomes optional**: the provider is included only
  when both `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are set. The
  Sign-in/Sign-up pages conditionally render the GitHub button.
- Session strategy switched from `database` to `jwt` so Credentials
  composes with the Drizzle adapter.
- `AUTH_URL` default → `https://suparbase.com`.
- Redactor now strips bcrypt hashes (`$2a$`, `$2b$`, `$2y$`).
- New migration: `drizzle/0002_minor_magus.sql`.

## v0.4.0 — 2026-05-13 — Coolify deployment

Tag: `v0.4.0` · Spec: [`specs/004-deploy-coolify/`](specs/004-deploy-coolify/)

- Production `Dockerfile` (multi-stage, non-root, Next.js standalone output).
- `docker-compose.yaml` with two services: `supabase/postgres` for the
  app database, and the Next.js app. No host port binding — Coolify's
  Traefik proxy routes by domain.
- `scripts/migrate.mjs` runs Drizzle migrations at container start.
- Operator only sets six env vars in Coolify; three of them Coolify can
  generate (`POSTGRES_PASSWORD`, `AUTH_SECRET`, `SUPARBASE_ENCRYPTION_KEY`).
  `DATABASE_URL` is composed inside the compose file.
- Constitution v3.1.0 unchanged (no new principle needed for deploy).

## v0.3.0 — 2026-05-13 — AI-augmented admin presets

Tag: `v0.3.0` · Spec: [`specs/003-ai-augmented-admin/`](specs/003-ai-augmented-admin/)

- Constitution **v3.0.0 → v3.1.0**: added Principle IX (AI Assistance)
  — opt-in, server-only, schema-only inputs, Zod-validated outputs,
  cached by fingerprint, graceful fallback.
- New `user_settings` table (encrypted OpenRouter key, default model,
  last-run token usage) and `schema_analysis` cache table.
- `src/server/ai/`: OpenRouter fetch wrapper with key probe, prompt
  builder, Zod schema validator, SHA-256 schema fingerprint,
  orchestrator with heuristic fallback.
- `/api/settings/ai` (GET/PUT/DELETE) and `/api/ai/analyze/[id]`
  (GET cached / POST run).
- Four lazy-loaded preset components: `UsersAdmin`, `ContentAdmin`,
  `LogsAdmin`, `GenericAdmin`. Each table routes to its preset; users
  can override per-session with `?view=generic`.
- Dashboard shows AI-derived category badge + display name.
- Redactor now strips `sk-or-…` / `sk-…` patterns in addition to JWTs.
- AI rate limit: 10 analyses / hour / user.

## v0.2.0 — 2026-05-13 — Authenticated SaaS

Tag: `v0.2.0` · Spec: [`specs/002-suparbase-saas/`](specs/002-suparbase-saas/)

- Constitution **v2.0.0 → v3.0.0**: Principle V replaced
  ("Client-Only SPA" → "Server-Side Vault & Proxy"); Principle VIII
  added (Account & Tenancy).
- Migrated from Vite SPA to **Next.js 15 (App Router)**.
- **NextAuth v5** with the Drizzle adapter and GitHub OAuth.
- **Drizzle ORM + PostgreSQL** schema for users / accounts / sessions /
  connections / audit_log.
- **AES-256-GCM credential vault** with versioned ciphertext (supports
  rotation via `SUPARBASE_ENCRYPTION_KEY_OLD`).
- **Server-side PostgREST proxy** at `/api/v/[id]/rest/[...path]` —
  the user's API key never reaches the browser. Streams responses,
  rate-limits writes, logs every write to an audit table.
- Replaced `supabase-js` (browser) with a small `pgrest()` fetch
  client targeting the proxy. Bundle dropped ~53 KB.
- HSTS / CSP / X-Content-Type-Options / Referrer-Policy /
  Permissions-Policy at the Next.js edge.

## v0.1.0 — 2026-05-13 — Client-only Vite SPA

Tag: `v0.1.0` · Spec: [`specs/001-supabase-admin/`](specs/001-supabase-admin/)

- Constitution **v1.0.0 → v2.0.0**: product redefined from a static
  marketing site to an interactive admin tool.
- Pure client-side React SPA (Vite + React 18 + TypeScript).
- Schema introspection via PostgREST's OpenAPI document.
- Per-table data grid with sort, search (server-side `ilike`),
  pagination, FK label resolution.
- Type-aware row form: text, textarea, number, switch, datetime,
  UUID with generator, JSON editor, enum select, FK reference picker.
- Delete with confirmation + 5-second undo via re-insert.
- Schema view and connection management.
- Mobile responsive nav.
- JWT role detection on connect; service-role key warning.
- Production-readiness pass: ErrorBoundary, mobile nav, boot-time
  credential health check, per-route titles, primary-key fallback for
  schemas without `<pk/>` tags.
- Constitution v1.0.0 initial: marketing-site stack (later supplanted
  by v2.0.0's app-stack rewrite).

---

## Conventions

- Each major version is a separate Spec-Kit feature directory at
  `specs/00N-<name>/` with `spec.md`, `plan.md`, optionally
  `research.md`, `data-model.md`, `contracts/`, `quickstart.md`,
  `tasks.md`, and `checklists/requirements.md`.
- Constitution amendments accompany every MAJOR/MINOR version bump and
  live at [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
- Tags `vN.M.0` mark the merged-to-main commit for each feature.
