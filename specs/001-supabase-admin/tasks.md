# Tasks: Suparbase: Auto-Admin for Supabase

**Feature directory**: `specs/001-supabase-admin/`
**Branch**: `001-supabase-admin`

Legend: `[P]` parallelizable (different files, no in-flight deps).
Story tags: `[US1]` connect, `[US2]` browse/read, `[US3]` create/edit/delete,
`[US4]` schema view, `[US5]` connection management.

---

## Phase 1: Setup

- [ ] T001 Initialize Vite + React + TypeScript project at repo root (`package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`)
- [ ] T002 Install runtime deps via pnpm: `react react-dom react-router-dom @supabase/supabase-js @tanstack/react-query @tanstack/react-table @tanstack/react-virtual react-hook-form @hookform/resolvers zod gsap @gsap/react sonner clsx tailwind-merge class-variance-authority lucide-react date-fns nanoid @fontsource-variable/geist-sans @fontsource-variable/geist-mono @fontsource-variable/fraunces`
- [ ] T003 Install dev deps: `typescript @types/react @types/react-dom @types/node @vitejs/plugin-react tailwindcss postcss autoprefixer`
- [ ] T004 [P] Configure Tailwind: `tailwind.config.ts` with custom colors (bg `#0A0A0B`, fg `#F5F5F1`, accent `#B6FF3C`, muted scale), font families, and content globs
- [ ] T005 [P] Configure PostCSS at `postcss.config.js`
- [ ] T006 [P] Write `src/index.css` with Tailwind layers, CSS-variable tokens for the color scale, and font-face imports
- [ ] T007 [P] Configure Vite at `vite.config.ts` (React plugin, path alias `@ → /src`, build target `es2020`, manual chunks for `vendor-react`, `vendor-supabase`, `vendor-tanstack`, `vendor-gsap`)
- [ ] T008 [P] Add `components.json` for shadcn registry config (style: "default", baseColor: "neutral", cssVariables: true, aliases pointing to `@/components/ui` and `@/lib/ui/cn`)
- [ ] T009 Add `pnpm` scripts to `package.json`: `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`
- [ ] T010 [P] Create `.gitignore` (node_modules, dist, .env*, .DS_Store)
- [ ] T011 [P] Add minimal `public/favicon.svg` (phosphor-green dot mark)

---

## Phase 2: Foundational

Blocks all user stories. Establishes shared modules and UI primitives.

- [ ] T020 [P] Write `src/lib/ui/cn.ts`: `clsx + tailwind-merge` helper
- [ ] T021 [P] Write `src/lib/motion/useReducedMotion.ts`: hook reading the media query, SSR-safe
- [ ] T022 [P] Write `src/lib/motion/gsap.ts`: `gsap.registerPlugin(useGSAP)`, shared eases
- [ ] T023 Add shadcn primitives into `src/components/ui/` (hand-write since no shadcn CLI runtime). Components needed: `button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `switch.tsx`, `select.tsx`, `dialog.tsx`, `drawer.tsx` (Radix Dialog with bottom variant), `dropdown-menu.tsx`, `tabs.tsx`, `tooltip.tsx`, `table.tsx` (styled `<table>` wrapper), `badge.tsx`, `skeleton.tsx`, `scroll-area.tsx`, `popover.tsx`, `command.tsx` (cmdk wrapper: install `cmdk` as dep), `separator.tsx`, `alert.tsx`. Each is a thin Radix wrapper with Tailwind classes consistent with the token scale.
- [ ] T024 Install `@radix-ui/react-*` packages and `cmdk` to back the primitives in T023
- [ ] T025 [P] Write `src/lib/connection/jwt.ts`: `decodeJwtRole(key: string): KeyRole`
- [ ] T026 [P] Write `src/lib/connection/validate.ts`: `validateUrl(input): { ok: true, url } | { ok: false, reason }` accepting `*.supabase.co` and `*.supabase.in`
- [ ] T027 Write `src/lib/connection/store.ts`: `load() / save(conn, { remember }) / clear()` with sessionStorage-first read order
- [ ] T028 [P] Write `src/lib/connection/redact.ts`: redact key substrings from any string before logging
- [ ] T029 Write `src/lib/supabase/client.ts`: factory `createClient(conn) → SupabaseClient` with a runtime check that `conn.url.hostname.endsWith('.supabase.co' | '.supabase.in')`
- [ ] T030 Write `src/lib/supabase/openapi.ts`: fetch OpenAPI doc, typed shapes (`OpenAPIDoc`, `OpenAPIDefinition`, `OpenAPIProperty`)
- [ ] T031 [P] Write `src/lib/schema/types.ts`: `Column`, `Table`, `Schema`, `ColumnTypeCategory`, `ForeignKey`, `TableKind`
- [ ] T032 [P] Write `src/lib/schema/typeMap.ts`: `typeMap(pgType, prop)` per contract
- [ ] T033 [P] Write `src/lib/schema/fkParser.ts`: `parseFk(description)` per contract (machine-readable + regex fallbacks)
- [ ] T034 [P] Write `src/lib/schema/labelColumn.ts`: `pickLabelColumn(columns)` per contract
- [ ] T035 Write `src/lib/schema/introspect.ts`: `introspect(conn): Promise<Schema>` combining T030–T034
- [ ] T036 [P] Write `src/lib/api/errors.ts`: `AppError`, `toAppError(input)` with PostgrestError mapping, key redaction
- [ ] T037 Write `src/lib/api/rows.ts`: `listRows`, `getRow`, `insertRow`, `updateRow`, `deleteRow` per data-access contract
- [ ] T038 [P] Write `src/lib/api/count.ts`: `countRows(client, tableName)`
- [ ] T039 [P] Write `src/lib/api/reference.ts`: `searchReferences(client, fk, labelColumn, term)`
- [ ] T040 Write `src/lib/api/hooks.ts`: React Query hooks (`useSchema`, `useRowCount`, `useRows`, `useRow`, `useInsertRow`, `useUpdateRow`, `useDeleteRow`)
- [ ] T041 Write `src/App.tsx`: provider stack (`QueryClientProvider`, `BrowserRouter`, `<Toaster />`), error boundary
- [ ] T042 [P] Write `src/main.tsx`: bootstrap, import `index.css`
- [ ] T043 Write `src/routes/RequireConnection.tsx`: guard component (reads `useConnection`; on `null` redirects to `/?next=...`)
- [ ] T044 Write `src/routes/WorkspaceLayout.tsx`: sidebar + topbar shell with `<Outlet/>`; lazy-import boundary for workspace routes lives here
- [ ] T045 [P] Write `src/components/workspace/Sidebar.tsx`: minimalist nav (Dashboard / Tables / Schema / Settings) with active route styling
- [ ] T046 [P] Write `src/components/workspace/Topbar.tsx`: connection summary + Refresh-schema button
- [ ] T047 [P] Write `src/components/workspace/EmptyState.tsx`
- [ ] T048 [P] Write `src/routes/NotFoundRoute.tsx`
- [ ] T049 Wire the router in `src/App.tsx` with the route table from `contracts/route-map.md` and `React.lazy` for all workspace routes

---

## Phase 3: User Story 1: Connect (P1)

**Goal**: A user can paste URL + key, see role detection (with service-role warning), connect, and land on the dashboard.

**Independent test**: With a real Supabase URL + anon key, the app introspects and routes to `/dashboard`. With invalid URL/key, clear error states display.

- [ ] T100 [US1] Write `src/routes/ConnectRoute.tsx`: composes `ConnectHero` + `ConnectForm`; redirects to `?next` or `/dashboard` if a connection already exists
- [ ] T101 [P] [US1] Write `src/components/connect/ConnectHero.tsx`: GSAP'd headline + tagline ("Your Supabase. Auto-admin'd."), Fraunces accent, reduced-motion fallback
- [ ] T102 [US1] Write `src/components/connect/ConnectForm.tsx`: `react-hook-form` form with URL + key fields, "Remember on this device" checkbox, submit button disabled until validation passes
- [ ] T103 [P] [US1] Write `src/components/connect/ServiceRoleWarning.tsx`: Radix Dialog requiring typed acknowledgement
- [ ] T104 [US1] Wire `ConnectForm.onSubmit`: validate URL → decode JWT → if `service_role` show warning dialog → call `introspect(conn)` → on success `save(conn, { remember })` and `navigate(next ?? '/dashboard')` → on failure surface category-specific error
- [ ] T105 [P] [US1] Write `src/components/connect/ErrorBanner.tsx`: surfaces categorized `AppError`
- [ ] T106 [US1] Smoke: cold connect with valid anon key → dashboard route loads; invalid URL → inline validation; wrong key → 401 banner

---

## Phase 4: User Story 2: Browse & Read (P1)

**Goal**: A connected user can navigate to a table, sort/search/paginate, open row detail, see FK labels.

**Independent test**: For a schema with ≥3 tables and ≥2 FKs, every table opens, paginates, sorts, searches, and FK cells resolve to labels.

- [ ] T200 [P] [US2] Write `src/routes/DashboardRoute.tsx`: calls `useSchema`, renders a grid of `TableTile` (`name`, column count, row count via `useRowCount`)
- [ ] T201 [P] [US2] Write `src/components/data/TableTile.tsx`: used by Dashboard
- [ ] T202 [P] [US2] Write `src/routes/TablesRoute.tsx`: full list of tables with column count + jump links
- [ ] T203 [P] [US2] Write `src/lib/table/buildColumns.ts`: `buildColumnDefs(table, schema): ColumnDef<Row>[]` for tanstack-table
- [ ] T204 [P] [US2] Write `src/lib/table/cells/index.tsx`: type-specific cell renderers (`TextCell`, `BoolCell`, `DateCell`, `JsonCell`, `UuidCell`, `EnumCell`, `FkCell`, `NullCell`)
- [ ] T205 [US2] Write `src/components/data/FkBadge.tsx`: given an FK target and value, looks up label via batched query, shows pill
- [ ] T206 [US2] Write `src/components/data/DataGrid.tsx`: uses tanstack-table + virtualization on page sizes > 50
- [ ] T207 [P] [US2] Write `src/components/data/DataGridToolbar.tsx`: search input (debounced 300ms), page-size selector, "New row" button
- [ ] T208 [P] [US2] Write `src/components/data/PaginationBar.tsx`
- [ ] T209 [US2] Write `src/routes/TableListRoute.tsx`: reads URL state (`useSearchParams`), drives `useRows`, composes Toolbar + Grid + Pagination
- [ ] T210 [US2] Write `src/components/row/RowDrawer.tsx`: Radix Dialog (side variant) showing all fields read-only with type-aware rendering; opens from row click
- [ ] T211 [US2] Write `src/routes/TableRowRoute.tsx`: full-page detail view (used when clicking "open in page" from drawer or arriving via deep link)
- [ ] T212 [US2] Smoke: open a table, sort col, search term, paginate forward/back, open row drawer; verify URL reflects state

---

## Phase 5: User Story 3: Create / Edit / Delete (P1)

**Goal**: Type-aware forms for create + edit; delete with confirmation and undo.

**Independent test**: For each of `text, int, bool, timestamp, jsonb, uuid, enum, fk` columns, create + edit + delete round-trips work, errors surface readably.

- [ ] T300 [P] [US3] Write `src/lib/forms/buildSchema.ts`: `buildZodSchema(columns)` returning a `z.ZodObject` matching nullability + types
- [ ] T301 [P] [US3] Write `src/lib/forms/buildDefaults.ts`: initial values from a `Row` (edit) or column defaults (create), skipping generated
- [ ] T302 [P] [US3] Write `src/lib/forms/fields/FieldText.tsx`
- [ ] T303 [P] [US3] Write `src/lib/forms/fields/FieldTextarea.tsx`
- [ ] T304 [P] [US3] Write `src/lib/forms/fields/FieldNumber.tsx`
- [ ] T305 [P] [US3] Write `src/lib/forms/fields/FieldBool.tsx`: Switch
- [ ] T306 [P] [US3] Write `src/lib/forms/fields/FieldDateTime.tsx`: native `<input type="datetime-local">` with UTC handling
- [ ] T307 [P] [US3] Write `src/lib/forms/fields/FieldUuid.tsx`: input + "generate" using `crypto.randomUUID()`
- [ ] T308 [P] [US3] Write `src/lib/forms/fields/FieldJson.tsx`: textarea with JSON parse-on-blur and inline error
- [ ] T309 [P] [US3] Write `src/lib/forms/fields/FieldEnum.tsx`: Select
- [ ] T310 [US3] Write `src/lib/forms/fields/FieldFk.tsx`: combobox using `cmdk` and `useDebouncedReferenceSearch` (calls `searchReferences`)
- [ ] T311 [US3] Write `src/components/row/RowForm.tsx`: given `Table` + optional `Row`, builds zod schema and renders the appropriate field per column, groups (identifiers / content / metadata), wires submit to `useInsertRow` / `useUpdateRow`
- [ ] T312 [P] [US3] Write `src/components/row/FieldGroup.tsx`: accessible fieldset wrapper
- [ ] T313 [US3] Write `src/routes/TableNewRoute.tsx`: uses `RowForm` in create mode; on success toast + navigate to `/tables/:name`
- [ ] T314 [US3] Extend `src/routes/TableRowRoute.tsx`: toggles between detail and edit (`?edit=1`); edit mode uses `RowForm` in edit mode
- [ ] T315 [US3] Write `src/components/row/DeleteRowDialog.tsx`: confirmation dialog with typed-pk confirmation for tables without PK (otherwise just confirm)
- [ ] T316 [US3] Wire delete in `DataGrid` row action and detail/edit screens → fetch row → `useDeleteRow` → toast with Undo (5s) → undo calls `useInsertRow` with the snapshot
- [ ] T317 [US3] Error mapping in `RowForm.onError`: when `AppError.columnHint` present, call `form.setError(columnHint, ...)`; otherwise show a banner
- [ ] T318 [US3] Optimistic update: `useInsertRow`/`useUpdateRow` apply optimistic cache updates; on error, rollback + toast
- [ ] T319 [US3] Smoke: create a row in 3 different tables (covering text/int/bool/timestamp/json/fk), edit fields, delete with undo

---

## Phase 6: User Story 4: Schema view (P2)

**Goal**: A connected user can inspect every table and column at a glance.

**Independent test**: Schema view enumerates every table and column with type, nullable, default, FK target.

- [ ] T400 [P] [US4] Write `src/routes/SchemaRoute.tsx`
- [ ] T401 [P] [US4] Write `src/components/schema/SchemaList.tsx`: collapsible per-table card listing columns
- [ ] T402 [P] [US4] Write `src/components/schema/ColumnRow.tsx`: name, type, nullable badge, default, FK pill, comment
- [ ] T403 [US4] Smoke: open `/schema` on a multi-table project; verify every table renders with all columns + FK + comments

---

## Phase 7: User Story 5: Connection management (P2)

**Goal**: A connected user can see project info and disconnect; can switch projects without orphan keys.

**Independent test**: Connect → settings → disconnect → connect again with a different project → workspace reflects new schema; both `localStorage` and `sessionStorage` are clean after disconnect.

- [ ] T500 [P] [US5] Write `src/routes/SettingsRoute.tsx`: shows hostname, key role, connectedAt, remember-state, with Disconnect button (Dialog confirm)
- [ ] T501 [P] [US5] Wire Disconnect → `clear()` → `queryClient.clear()` → navigate to `/`
- [ ] T502 [US5] In Topbar, add a project-pill that links to Settings
- [ ] T503 [US5] Smoke: full project-swap flow; verify storage cleared via DevTools

---

## Phase 8: Polish & Cross-Cutting

- [ ] T600 Add "Refresh schema" action in Topbar → invalidates `useSchema` and table queries
- [ ] T601 [P] Wire `useReducedMotion()` into `ConnectHero` to gate GSAP animations
- [ ] T602 [P] A11y pass: keyboard-only walk through connect → dashboard → table list → row drawer → create → edit → delete → schema → settings → disconnect; ensure every interactive element has a visible focus ring (Tailwind `focus-visible:ring-2 focus-visible:ring-accent`)
- [ ] T603 [P] A11y pass: every `<input>` has an associated `<Label>`; every form error has `aria-describedby`; every Dialog has `aria-labelledby`/`aria-describedby` (Radix handles most via primitives: verify)
- [ ] T604 [P] Empty states: each route has a meaningful empty/error/loading state (no `null` returns from routes)
- [ ] T605 [P] Verify Mobile (<768px) read-only behavior: tables are scrollable, create/edit forms display a "best on larger screen" notice
- [ ] T606 Perf check: run `pnpm build` and verify gzip sizes against budgets (220KB landing JS, 80KB CSS, 480KB total any first paint); document actuals in `docs/build-sizes.md`
- [ ] T607 [P] Lighthouse run on the landing/connect route → Performance ≥ 90, A11y ≥ 95, Best Practices ≥ 95; capture screenshot under `docs/lighthouse.png`
- [ ] T608 [P] Security audit: grep src for `console.log` (allow none on keys), confirm `redact.ts` is used by `toAppError`; confirm `client.ts` host check refuses non-supabase hosts
- [ ] T609 Update `README.md` with quickstart, screenshots, deploy instructions, and link to the spec dir
- [ ] T610 Final smoke checklist run-through from `quickstart.md`

---

## Dependencies

- Phase 1 (Setup) blocks everything.
- Phase 2 (Foundational) blocks all user stories (especially T035 introspect, T037 rows, T040 hooks).
- US1 (Connect) blocks US2/US3/US4/US5 in practice (no workspace without a connection), but they can be developed in parallel against a stubbed `Connection` for local dev · the route guard merely redirects.
- US2 (Browse) blocks US3 (Create/Edit/Delete) for the DataGrid integration of row actions; T206 must exist before T316 wires delete.
- US3, US4, US5 are independent of each other.
- Phase 8 (Polish) runs after all stories complete.

## Parallel execution examples

- After T020–T024 land, T025–T040 can fan out: most are different files (`[P]` marked).
- All US3 field components (T302–T310) can be implemented in parallel by different agents.
- A11y, Lighthouse, security, and docs passes (T602, T603, T607, T608, T609) in Phase 8 are fully parallel.

## MVP definition

US1 + US2 + US3: i.e., Phases 1, 2, 3, 4, 5 (skipping Schema view and Settings UI for v0). After US3 lands, the app is a working admin tool. US4 and US5 are quality-of-life polish that should ship before any external use.
