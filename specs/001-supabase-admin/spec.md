# Feature Specification: Suparbase — Auto-Admin for Supabase

**Feature Branch**: `001-supabase-admin`

**Created**: 2026-05-13

**Status**: Draft

**Input**: User description: "Build an admin dashboard for Supabase. The user enters their Supabase project URL and API key. We fetch the full schema, analyze the schema to find meaningful data, and present a working admin panel out of it so they don't have to build their own. This is the full product."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Connect a Supabase project in under one minute (Priority: P1)

A developer who already has a Supabase project lands on the app, pastes their
project URL and an API key, clicks "Connect", and within seconds sees a working
dashboard listing every table in their schema with row counts. No code, no
configuration files, no deploy.

**Why this priority**: Without a successful connection, nothing else exists.
Connection is the entire entry funnel.

**Independent Test**: Take a fresh Supabase project, paste its URL and anon key
into the connect screen, click connect, and verify the dashboard renders
every introspected table without errors. Repeat with an invalid URL and a
wrong key — verify clear error states.

**Acceptance Scenarios**:

1. **Given** a visitor on the connect screen with a valid Supabase URL and
   anon key, **When** they click "Connect", **Then** the app introspects the
   schema, displays a success state, and routes to the dashboard within 3
   seconds on typical broadband.
2. **Given** a visitor pastes an obviously malformed URL (e.g., missing
   `.supabase.co`), **When** they submit, **Then** the form shows an inline
   validation error and does NOT attempt a network call.
3. **Given** a visitor submits a syntactically valid URL but an invalid API
   key, **When** the request returns 401, **Then** the connect screen displays
   a specific, non-leaky error message ("This key was rejected by your
   project") and the key field is preserved.
4. **Given** a visitor pastes a service-role key, **When** the app detects the
   role from the JWT payload, **Then** the UI displays a prominent warning
   before the request is sent, requiring an explicit "I understand" click.
5. **Given** the visitor checks "Remember on this device" and connects
   successfully, **When** they return to the app on the same device, **Then**
   they bypass the connect screen and land on the dashboard. **When** they
   leave it unchecked, **Then** credentials live only for the tab session.

---

### User Story 2 — Browse and read your data (Priority: P1)

A connected user navigates to a table, sees a paginated list of rows in a
clean data grid with column headers inferred from the schema. They can sort by
column, search/filter, paginate, and click into a row to see all its fields
in a readable detail view. Foreign-key columns render as labels showing
related-row context, not just raw IDs.

**Why this priority**: Most of the time spent in an admin tool is reading.
Browsing must be fast, scannable, and accurate.

**Independent Test**: For a schema with ≥3 tables and ≥2 foreign-key
relationships, open each table, paginate, sort by at least one column, search
by a text column, and open a row's detail view. Verify foreign-key columns
show meaningful labels.

**Acceptance Scenarios**:

1. **Given** a table with 200 rows, **When** the user opens it, **Then** they
   see the first page (default 25 rows) within 1 second on a typical
   connection, with pagination controls.
2. **Given** a user clicks a sortable column header, **When** the sort applies,
   **Then** the table re-queries and re-renders in the new order; the sort
   state is reflected in the URL.
3. **Given** a user types a search term, **When** the debounced search fires,
   **Then** results filter on appropriate text columns (best-effort: columns
   detected as `text`/`varchar`).
4. **Given** a table has a foreign-key column to another table with a
   human-readable column (e.g., `users.email`, `posts.title`), **When** the
   row is displayed, **Then** the FK cell shows that label instead of the raw
   UUID.
5. **Given** a user clicks a row, **When** the detail view opens, **Then** all
   columns are displayed grouped logically (identifiers, primary content,
   relationships, timestamps), with type-appropriate rendering (booleans as
   pills, JSON formatted, timestamps human-relative).

---

### User Story 3 — Create, edit, and delete rows safely (Priority: P1)

A connected user creates a new row in any table via an auto-generated form
where each field uses an input appropriate to its type. They edit an existing
row, save, and see the change reflected immediately. They delete a row and
must explicitly confirm. Errors from the database (constraint violations,
RLS rejections) are surfaced clearly.

**Why this priority**: A read-only admin is half a product. Write operations
complete the value proposition.

**Independent Test**: For each of these field types in a target schema —
`text`, `int`, `bool`, `timestamp`, `jsonb`, `uuid`, `enum`, and a foreign-key
column — verify create, edit, and delete work, validation fires on bad input,
and constraint errors surface readably.

**Acceptance Scenarios**:

1. **Given** a user clicks "New row" in a table, **When** the form renders,
   **Then** each editable column uses a type-appropriate input: text → input,
   long text (≥255) → textarea, int/float → numeric input, bool → switch,
   timestamp → datetime picker, jsonb → JSON editor, FK → searchable
   reference picker, enum → select.
2. **Given** the user submits a valid form, **When** the insert succeeds,
   **Then** they see a toast confirmation and are returned to the table list
   with the new row visible.
3. **Given** the user submits a form that violates a NOT NULL or CHECK
   constraint, **When** Postgres returns an error, **Then** the form
   highlights the offending field (when identifiable) and shows the database
   error message in plain language.
4. **Given** auto-managed columns exist (`id` with `gen_random_uuid()`,
   `created_at` with `now()`), **When** the create form renders, **Then**
   those columns are hidden from the form but visible on the row after
   insert.
5. **Given** the user clicks "Delete" on a row, **When** the confirmation
   dialog appears, **Then** they must explicitly confirm; canceling is the
   default. After confirmation, the row is removed and a toast offers
   undo for 5 seconds where the API supports it (single-row delete by PK).
6. **Given** a user lacks RLS permission for an operation, **When** they
   attempt it, **Then** the error is surfaced clearly and does not leave the
   UI in an inconsistent state.

---

### User Story 4 — Understand the schema at a glance (Priority: P2)

A connected user opens a "Schema" view that lists every table with its
columns, types, primary key, and foreign-key relationships. They can see at a
glance how the data is structured without writing a query.

**Why this priority**: Many admins inherit schemas they didn't design. A
clear schema overview reduces friction.

**Independent Test**: Open the Schema view on a schema with ≥5 tables and
inspect that every table, every column type, and every FK relationship is
listed.

**Acceptance Scenarios**:

1. **Given** the user opens the Schema view, **When** it renders, **Then** every
   table is listed with: name, row count (if cheap to compute), column list
   (name, type, nullable, default).
2. **Given** a table has a foreign key, **When** displayed, **Then** the FK
   relationship is shown both on the source column and as a back-reference on
   the target table's row.
3. **Given** a column has a comment in the database, **When** displayed,
   **Then** the comment text appears next to the column name.

---

### User Story 5 — Manage the connection (Priority: P2)

A connected user can disconnect (clearing credentials), switch to a different
project, view which project they are connected to, and see whether they are
using anon or service-role credentials.

**Why this priority**: Required for trust and for users juggling multiple
projects.

**Independent Test**: Connect to project A, disconnect, connect to project B,
verify the workspace reflects B's schema and credentials are scoped.

**Acceptance Scenarios**:

1. **Given** a connected user opens settings, **When** the settings panel
   renders, **Then** it displays the project URL (host only — no key), the
   key role (anon / authenticated / service_role / unknown), and a
   "Disconnect" action.
2. **Given** the user clicks Disconnect, **When** they confirm, **Then** all
   credentials in localStorage and sessionStorage are removed and they are
   returned to the connect screen.
3. **Given** a user is on the connect screen but credentials exist for a
   previous project, **When** they connect to a new project, **Then** the
   previous credentials are replaced (no orphan keys remain).

---

### Edge Cases

- **No tables exist**: schema introspects but returns zero tables — show an
  empty state explaining how to add tables to the project.
- **Schema introspection times out**: show a retry affordance with the
  underlying network error category (timeout / DNS / TLS / HTTP 4xx / HTTP
  5xx).
- **Very wide tables (>20 columns)**: the data grid horizontally scrolls;
  primary key and the most-meaningful detected label column are sticky.
- **Very tall content (paragraph in a row)**: truncate in the grid with
  expand-on-hover; full content visible in the detail view.
- **Null vs empty string**: distinguish visually in the grid; in forms,
  preserve nulls on edit unless the user explicitly types into the field.
- **No primary key**: surface a warning in the table view; disable edit/delete
  for that table (cannot target a row safely without a PK).
- **Views vs tables**: read-only access; create/edit/delete disabled with a
  clear "this is a view" indicator.
- **Computed columns / generated identity**: hidden in the create form.
- **RLS-protected reads**: empty result is correct; show a contextual hint
  ("This may be filtered by RLS") only when the user is signed in via Supabase
  Auth and policies likely apply.
- **Schema changes mid-session**: when a write fails because the schema
  changed (column added/removed), prompt the user to refresh the schema.
- **Browser back/forward**: navigating with the browser preserves table,
  page, sort, and filter state via URL.
- **Two tabs open with different projects**: each tab's session is
  independent; persisted credentials reflect the most recently confirmed
  project.

## Requirements *(mandatory)*

### Functional Requirements

**Connection**

- **FR-001**: The app MUST present a connect screen as the unauthenticated
  entry point that accepts a Supabase project URL and an API key.
- **FR-002**: The app MUST validate that the URL is a syntactically valid
  HTTPS URL ending in `.supabase.co` (or `.supabase.in`, accepting both
  modern and legacy hosts) before attempting any network call.
- **FR-003**: The app MUST detect the role embedded in the JWT API key
  (`anon`, `authenticated`, or `service_role`) by decoding the JWT payload
  client-side, and MUST display a prominent warning if the role is
  `service_role` before sending the key over the network.
- **FR-004**: The connect form MUST offer a "Remember on this device" opt-in.
  Checked → persist credentials in `localStorage`. Unchecked → keep
  credentials only in `sessionStorage` for the tab.
- **FR-005**: On successful introspection, the app MUST route to the
  dashboard. On failure, the connect screen MUST display a category-specific
  error and preserve the user's entered values.
- **FR-006**: The app MUST display a "Disconnect" action that clears
  credentials from both `localStorage` and `sessionStorage` and returns to
  the connect screen.

**Schema introspection**

- **FR-010**: The app MUST fetch the project's PostgREST OpenAPI document at
  `${url}/rest/v1/?apikey=${key}` and parse it to discover tables, columns,
  types, nullability, primary keys, and foreign-key hints.
- **FR-011**: The app MUST identify, for each table: column name, column
  type (textual category — string, integer, float, boolean, datetime, json,
  uuid, enum, unknown), nullable, default value (when present), primary key
  membership, and foreign-key targets (when described in the OpenAPI
  description text by PostgREST's standard `Note:\nThis is a Foreign Key
  to ...` format).
- **FR-012**: The app MUST identify, for each table, a "human label column"
  — the first column matching a priority list: `name`, `title`, `email`,
  `slug`, `username`, `handle`, `display_name`, `label`, falling back to the
  primary key. This label column is used for foreign-key reference rendering.
- **FR-013**: The app MUST distinguish tables from views (PostgREST exposes
  this) and MUST disable write operations for views.
- **FR-014**: The app MUST cache the introspected schema per connection in
  memory for the session, with a "Refresh schema" action that re-fetches.

**Dashboard**

- **FR-020**: The dashboard MUST list every introspected table with: table
  name, column count, a row count (fetched via `HEAD` request with
  `Prefer: count=exact` and `Range-Unit: items`), and a link into that
  table's list view.
- **FR-021**: The dashboard MUST display the connected project's host name
  and the key role.
- **FR-022**: The dashboard MUST provide a "Refresh schema" control.

**Table list view**

- **FR-030**: Opening a table MUST display a paginated data grid with default
  page size 25. Page size MUST be adjustable from a set of [10, 25, 50, 100].
- **FR-031**: Column headers MUST be clickable to sort ascending / descending
  / unsorted. Sort, page, page size, and search MUST be encoded in the URL
  query string.
- **FR-032**: A search input MUST debounce-filter (300ms) using a server-side
  `ilike.*term*` filter applied across columns detected as text-like.
- **FR-033**: Each row MUST be clickable to open a detail view (a side
  drawer or dedicated route).
- **FR-034**: Foreign-key cells MUST display the related row's human label
  column when fetchable (batched in one extra request per FK target visible
  on the page).
- **FR-035**: Rows MUST be virtualized when page size > 50.
- **FR-036**: A "New row" action MUST be visible at the top of every editable
  (non-view) table; "Edit" and "Delete" actions MUST appear on each row.

**Row detail / create / edit**

- **FR-040**: The detail/edit view MUST present columns grouped: identifiers
  (PK), content (everything else, in column order), and metadata
  (`created_at`, `updated_at`, etc., detected by name).
- **FR-041**: The form MUST select an input control by column type:
  - `text` / `varchar`: single-line input (or textarea when `text` or when
    sample value ≥ 255 chars)
  - `bool`: switch / checkbox
  - `int*` / `numeric` / `float`: numeric input with type-appropriate step
  - `timestamp` / `timestamptz` / `date`: datetime picker (UTC-aware for tz)
  - `uuid`: input with a "generate" affordance
  - `jsonb` / `json`: JSON editor with syntax highlighting
  - `enum`: select with the enum's values
  - FK column: searchable reference picker that queries the target table on
    the human label column with `ilike.*term*`
- **FR-042**: Auto-managed columns (PK with `gen_random_uuid()` or
  `nextval()` default, timestamps with `now()` default, generated identity)
  MUST be hidden from the create form and read-only on the edit form.
- **FR-043**: On submit, the form MUST send an `insert` or `update` to
  PostgREST with `Prefer: return=representation` to get the saved row back
  and update the UI optimistically (rollback on failure).
- **FR-044**: On error from the database, the form MUST surface the error in
  context (field-level when the error names a column; form-level otherwise)
  with the Postgres error message verbatim.
- **FR-045**: Delete MUST require explicit confirmation via dialog and MUST
  display a toast with an Undo affordance (re-insert via the previously
  fetched representation) for 5 seconds afterward, where the table has a
  primary key.

**Schema view**

- **FR-050**: The Schema view MUST list every table with its columns (name,
  type, nullable, default, FK target, comment if present), grouped by table
  with a sticky table-name header.

**Cross-cutting**

- **FR-060**: All routes (`/`, `/dashboard`, `/tables`, `/tables/:name`,
  `/tables/:name/new`, `/tables/:name/:pk`, `/schema`, `/settings`) MUST be
  bookmarkable and reflect their state in the URL.
- **FR-061**: The app MUST require a valid connection before rendering any
  workspace route; unauthenticated requests to workspace routes MUST redirect
  to the connect screen.
- **FR-062**: The app MUST never proxy credentials through any third party;
  all requests to the user's Supabase project go directly from the user's
  browser to their Supabase host.
- **FR-063**: The app MUST never log API keys to the browser console or
  attach them to any client-side error report.
- **FR-064**: The app MUST be keyboard-navigable: every row action, dialog
  action, form field, and navigation link MUST be reachable via Tab with a
  visible focus ring.
- **FR-065**: The app MUST honor `prefers-reduced-motion: reduce` and skip
  all non-essential animations.
- **FR-066**: Color contrast for text MUST meet WCAG AA.
- **FR-067**: The app MUST be responsive from 768px upward (tablet/desktop).
  Mobile (<768px) MUST present a usable read-only view of any single table
  with a notice that editing is best on a larger screen.

**Out of scope (will not be built in v1)**

- Multi-user collaboration features (shared sessions, comments on rows).
- SQL query editor / arbitrary SQL execution.
- Storage bucket browser (only column-level previews of public URLs).
- Auth user management UI (managing `auth.users` records).
- Database migrations or schema editing (no DDL).
- Saved views / filter presets across sessions.
- Server-side persistence of anything (no first-party backend).
- Self-hosted Supabase support beyond what `supabase-js` already supports.
- Mobile-first editing UX.

### Key Entities

- **Connection**: project URL, API key, key role, persistence scope (session
  vs device), last connected at.
- **Schema**: a snapshot of introspected metadata (tables, columns,
  relationships, enums).
- **Table**: name, kind (table | view), columns, PK columns, FK relationships,
  detected label column.
- **Column**: name, type category, raw type, nullable, default, is generated,
  enum values (if any), FK target (table + column), comment.
- **Row**: a typed record keyed by column name.
- **Filter / Sort / Page**: URL-encoded state for a table's list view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user with a valid Supabase project can reach a
  working dashboard within 60 seconds of arriving on the connect screen.
- **SC-002**: For schemas of up to 50 tables and 100 columns per table,
  introspection completes within 3 seconds on broadband.
- **SC-003**: List-view first paint for a table with up to 1,000 rows occurs
  within 1 second of navigation.
- **SC-004**: Sort, search, and page-change interactions update the visible
  table within 600ms on broadband.
- **SC-005**: Create, update, and delete round-trips show user-visible
  confirmation (toast or inline) within 500ms of the network response.
- **SC-006**: The unauthenticated landing/connect screen achieves Lighthouse
  Performance ≥ 90 and Accessibility ≥ 95 on a production build.
- **SC-007**: 95% of a sample of 5 real Supabase schemas introspect with
  zero unknown column types and at least one detected human-label column
  per table that has one.
- **SC-008**: A keyboard-only user can complete the full happy path
  (connect → open table → create row → edit row → delete row → disconnect)
  using only the keyboard with visible focus at every step.
- **SC-009**: `prefers-reduced-motion: reduce` removes all animation on the
  landing/connect screen and all transition motion in the workspace.

## Assumptions

- The user has an existing Supabase project; the app does not create projects.
- The user's Supabase project exposes its public schema via PostgREST (the
  default for all Supabase projects).
- API keys are JWTs (true for Supabase) — role detection assumes the JWT
  payload contains a `role` claim.
- Anon-key access is bounded by RLS policies set on the user's project. The
  app does not promise data access beyond what the key allows.
- Service-role keys bypass RLS — the app warns but does not refuse; the user
  is responsible for that choice.
- Modern evergreen browsers; no IE11.
- v1 ships English only.
- Connection credentials in `localStorage` are acceptable per the user's
  explicit opt-in; the app does not implement any additional encryption-at-
  rest in the browser.
