# Phase 0: Research

## 1. Schema introspection strategy

**Decision**: Fetch the PostgREST OpenAPI document at
`${SUPABASE_URL}/rest/v1/?apikey=${KEY}` with `Accept: application/openapi+json`
and parse the resulting Swagger 2.0 JSON to derive tables, columns, types,
nullability, primary keys, and foreign-key hints. Treat each entry in
`definitions` as a table or view (PostgREST exposes both). Determine kind
(table vs view) from the `paths` entry: tables have `post`/`patch`/`delete`
methods; views only have `get`.

**Rationale**: This is the only schema source available with an anon key on a
default Supabase project. It is well-documented in PostgREST and the format is
stable. The OpenAPI document includes column types (in `format`), defaults (in
`default`), required-ness (in `required[]`), and PostgREST's signature FK
description text in the column `description`.

**Foreign-key parsing**: PostgREST emits a string like:
`Note:\nThis is a Foreign Key to \`public.users.id\`. <fk table='users'
column='id'/>`: we extract the target via the HTML-comment-like attribute when
present, falling back to a regex against the readable note. Tested patterns
seen in PostgREST 12+.

**Primary-key detection**: From the OpenAPI columns where the description
contains `<pk/>` (PostgREST's tag), or when not present, fall back to the
column named `id` if a single such column exists.

**Enum detection**: OpenAPI `enum: [...]` on the column schema.

**Alternatives considered**:
- `pg-meta` HTTP endpoint: only exposed on self-hosted by default; not safe
  to depend on for Supabase Cloud.
- Direct `information_schema` query via RPC: requires user to install a
  custom function on their project; breaks the "no setup" promise.
- `supabase-js` admin SDK: requires service role; we want anon to work.

## 2. Connection persistence

**Decision**: A small `connection/store.ts` module with three operations:
`load()`, `save(conn, { remember: boolean })`, `clear()`. On save with
`remember: true`, writes JSON to `localStorage.suparbase.connection`. Without
remember, writes to `sessionStorage`. On `load()`, prefer
`sessionStorage` (in-flight session), then `localStorage`. On `clear()`,
remove both.

**Rationale**: Browsers isolate `sessionStorage` per tab, which gives the
correct multi-tab semantics described in the spec edge cases. `localStorage`
is acceptable for the explicit "remember" opt-in. We do not implement
encryption-at-rest: the threat model accepts that anyone with browser
access to the device can read the key, same as a `.env` file on disk.

**Alternatives considered**:
- IndexedDB: more code, no security benefit, browser-isolation behavior
  identical.
- Web Crypto subtle encryption with a derived key: the derivation seed has
  to live somewhere too: net effect is obfuscation, not security.

## 3. JWT role detection

**Decision**: Decode the JWT payload client-side by splitting on `.` and
base64url-decoding the middle segment. Look at the `role` claim:
- `"anon"` → safe
- `"authenticated"` → safe (session token)
- `"service_role"` → show prominent warning before connecting
- anything else (or decode failure) → category "unknown", show a softer
  warning

No signature verification (we don't have the project's JWT secret, and the
key will be validated by the actual Supabase API on connect anyway).

**Rationale**: Spec FR-003 demands client-side role detection before any
network call. JWT decoding is ~12 LOC.

## 4. Data access: list, count, CRUD

**Decision**: Use `@supabase/supabase-js` for CRUD operations against
PostgREST. Wrap calls in `lib/api/rows.ts` so React Query hooks always go
through one place.

- **List**: `client.from(table).select('*', { count: 'exact' }).range(from, to).order(...)`
  with `Prefer: count=exact` for accurate counts when the table is small;
  fall back to `count=estimated` when a `_count` query times out (we treat a
  3s soft timeout as "estimate is fine").
- **Count-only (dashboard tiles)**: HEAD request via supabase-js
  `select('*', { count: 'estimated', head: true })`: fast, no payload.
- **Search**: `or('col1.ilike.%term%,col2.ilike.%term%,...')` across text-like
  columns. We cap at 8 columns to avoid pathological queries.
- **Insert / Update**: with `Prefer: return=representation`.
- **Delete**: by primary key; before deleting, fetch the row so we can
  re-insert it for the 5-second undo (best effort: undo fails gracefully
  if the table has unique constraints that race).

**Alternatives considered**:
- Raw fetch: more code; we'd reimplement what supabase-js already does.
- Drizzle / Kysely / Prisma client: not relevant here · those are query
  builders for first-party backends.

## 5. Data grid

**Decision**: `@tanstack/react-table` v8 for state (column defs, sorting,
pagination), `@tanstack/react-virtual` v3 for row virtualization on pages
> 50. Column defs are derived once per table from the `Column[]` schema by
`lib/table/buildColumns.ts`; per-type cell renderers live in
`lib/table/cells/`.

**Rationale**: Tanstack is the de-facto headless choice; explicitly built for
server-side pagination and virtualization. Decoupled from look: we own
markup and Tailwind classes.

## 6. Form generation

**Decision**: For each editable column, `lib/forms/buildSchema.ts` produces a
`zod` schema; `lib/forms/fields/` provides a component per type category. A
`<RowForm>` component takes a `Table` and an optional `Row`, builds the
schema and defaults, hands them to `react-hook-form` via `zodResolver`, and
maps each visible column to its field component.

**Rationale**: One generation pipeline, six field components: small, reusable,
follows Principle VI.

**Field components (initial set)**:
- `FieldText`: string / varchar (single-line)
- `FieldTextarea`: long text
- `FieldNumber`: int / float / numeric
- `FieldBool`: switch
- `FieldDateTime`: timestamp / timestamptz / date
- `FieldUuid`: text input + "generate" button
- `FieldJson`: `<textarea>` with formatting (a real Monaco-grade editor is
  out of scope for v1; we ship JSON.parse/JSON.stringify with error
  highlighting)
- `FieldEnum`: select
- `FieldFk`: combobox that queries the target table on the label column

## 7. Routing

**Decision**: `react-router-dom` v6 with the data-router pattern, but using
plain `<Route>` elements (no loaders: React Query handles data). A
`<RequireConnection>` wrapper at the workspace layout level redirects to `/`
when no connection is present.

**URL state**:
- `?page=N&size=25&sort=col.asc&q=term` for table list views
- Schema and Settings routes are stateless beyond their path.

**Alternatives considered**:
- Tanstack Router: nicer types, additional dependency cost not justified
  for ~8 routes.

## 8. Motion plan

The only GSAP-driven surface is the **connect** screen. Animations there:
- Split-text headline fade-up on load (`opacity 0 → 1, y 24 → 0`, 800ms,
  stagger 40ms per word, ease `power3.out`)
- Tagline + form fade-up after headline (delay 300ms)
- Subtle parallax on a single decorative SVG mark
- Reduced-motion fallback: no entrance animation; instant visibility.

Workspace transitions use CSS `transition-opacity`/`transform` on Radix
primitives + a 120ms route-fade via React Router's `useNavigation` (no GSAP).

## 9. Styling system

**Decision**:
- Base: Tailwind CSS 3.4 with a small custom theme: near-black background
  `#0A0A0B`, off-white text `#F5F5F1`, single accent `#B6FF3C` (phosphor
  green), muted grays at alpha 6/12/24/48.
- Components: shadcn/ui generated into `src/components/ui/` (we do not ship
  the shadcn registry as a runtime dependency).
- Typography: `@fontsource-variable/geist-sans` (body, UI),
  `@fontsource-variable/geist-mono` (code, JSON, IDs),
  `@fontsource-variable/fraunces` (landing headline accent only: display).
- Tokens declared as CSS variables in `:root` and read by Tailwind via the
  `theme.extend` config. This lets a future light theme drop in.

**Alternatives considered**:
- All-shadcn defaults: looks like every other shadcn dashboard. Principle III
  rejects.

## 10. Performance plan

- **Route splitting**: `routes/Connect*` and the GSAP bundle are in the
  initial chunk; the workspace (`routes/Dashboard*`, table grid, forms,
  tanstack-table, react-hook-form, zod) are behind a `React.lazy` boundary
  at the workspace layout, so visitors who land and bounce never load the
  workspace JS.
- **Tanstack table**: imported only inside workspace chunks.
- **GSAP**: imported only in `connect/ConnectHero.tsx` and `lib/motion/`.
- **React Query**: `staleTime: 30s` for schema introspection, `5s` for table
  data, `Infinity` for static lists (enum values). `gcTime: 5 min`.
- **Lighthouse target**: connect screen ≥ 90 perf, ≥ 95 a11y. Workspace is
  measured separately as warm-cache TTI ≤ 2.5s.

## 11. Error handling

Categorize errors and present them consistently:

| Category | Source | UI treatment |
|----------|--------|--------------|
| `network` | fetch failed / DNS / TLS | "Could not reach this Supabase host." with retry |
| `unauthorized` | HTTP 401 | "This key was rejected by your project.": preserve form values |
| `forbidden` | HTTP 403 | "This key cannot access this resource (likely RLS)." |
| `not_found` | HTTP 404 | "Endpoint not found: is this URL correct?" |
| `constraint` | HTTP 409 / PG `23xxx` codes | Field-level highlight when column identifiable; show PG message |
| `rate_limited` | HTTP 429 | "Rate-limited by Supabase. Retrying in N seconds." |
| `server` | HTTP 5xx | Generic + correlation id when present |
| `client_bug` | thrown JS | toast + console.error (NEVER include keys) |

All errors route through `lib/api/errors.ts` which maps Supabase's `PostgrestError`
shape to a `AppError { category, message, columnHint? }`.

## 12. Security review (Principle VII compliance)

- API keys are NEVER logged to console (a debug-mode toggle ships off; even
  when "verbose" is enabled, key fields are redacted by
  `lib/connection/redact.ts` before logging).
- Service-role detection forces a `<ServiceRoleWarning />` modal with a
  typed acknowledgement before the network request is sent.
- "Disconnect" clears both `localStorage` and `sessionStorage` entries.
- No third-party analytics, no error reporters, no marketing pixels in v1.
- Outbound requests target only the user's Supabase host. We assert this
  with a runtime check in `supabase/client.ts`: if a fetch is attempted to
  any host that doesn't match `*.supabase.co|.in`, log + abort.
- CSP recommendations are documented in `quickstart.md` for self-deployers.
