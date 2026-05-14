# Feature Specification: More Archetypes (v1.1)

**Feature Branch**: `010-more-archetypes`

**Created**: 2026-05-14

**Status**: Draft

**Input**: User description: "Can we create multiple different presets for what will appear how, so that they can be applied to any different schema as required by the user."

## Why this release

The v0.6 archetype system (Users / Content / Logs / Generic) was a proof of concept that opinionated, AI-routed presets dramatically improve the admin experience over a flat data grid. v1.1 extends that system with three more archetypes that cover the most common table shapes outside the current set:

- **Commerce**: orders, transactions, invoices, payments
- **Tasks**: tickets, issues, todos with a workflow status + assignee
- **Messages**: comments, threads, conversations with author + body + parent

After v1.1, any Supabase project with an orders table, a tickets table, or a comments table will automatically land on a purpose-built admin instead of the generic row card grid.

## User Scenarios & Testing

### User Story 1: Orders feel like an order admin, not a row grid (Priority: P1)

A user with an `orders` (or `invoices`, `transactions`, `payments`) table opens it. The list shows order number + customer label + status pipeline pill + total amount formatted with currency + created timestamp. Clicking opens a detail page with the order total at display size, a status timeline visualization, the line-items relation, and a customer card.

### User Story 2: Tickets feel like a workflow tool, not a row grid (Priority: P1)

A user with a `tasks` (or `tickets`, `issues`, `todos`) table opens it. The list groups rows by status (To do / In progress / Done / etc.) with each row showing title + assignee avatar + priority chip + due date. The detail page shows the status as a stepper, the assignee + reporter relations as cards, and any sub-tasks via incoming FKs.

### User Story 3: Messages feel like a conversation, not a row grid (Priority: P2)

A user with a `comments` (or `messages`, `threads`, `conversations`) table opens it. The list renders as a threaded feed: author avatar + body excerpt + thread depth via parent_id + relative time + reply count. The detail page shows the full body, the author card, the parent (if any) inline, and any replies.

## Functional Requirements

### Type system (FR-T01–FR-T03)

- **FR-T01**: `TableCategory` adds three new values: `"commerce"`, `"tasks"`, `"messages"`. The full enum becomes `users | content | logs | commerce | tasks | messages | generic`.
- **FR-T02**: All existing `TableAnalysis` consumers (Dashboard, Tables list, schema view, preset routers) handle the new categories gracefully.
- **FR-T03**: The zod schema in `responseSchema.ts` and the AI prompt category enum both expand to match.

### AI classification (FR-A01–FR-A03)

- **FR-A01**: The AI prompt teaches each new category with concrete signals (column names, types, foreign-key patterns).
- **FR-A02**: Heuristic fallback rules detect each new category from table-name + column-shape patterns: e.g. `orders` table with `total_amount` + `status` → commerce; `tasks` table with `status` + `assignee_id` → tasks; `comments` table with `body` + `author_id` + `parent_id` → messages.
- **FR-A03**: Classification is exclusive: every table picks exactly one category. When two categories could apply (e.g. an `orders` table that also has a long `notes` body), the AI prompt explicitly prefers the dominant UI need.

### Commerce archetype (FR-C01–FR-C05)

- **FR-C01**: `CommerceAdmin` (list view) uses PageHeader chrome + stat tiles + row cards matching the v1.0 visual language.
- **FR-C02**: Each row card shows the order identifier (order_number or PK), customer label (via FK if present), status pill, total amount with currency formatting, and created-at time.
- **FR-C03**: `CommerceDetail` shows the total at display size in a hero card, a status pipeline visualization (pending → paid → shipped → delivered etc.), customer relation as a card, and a "Line items" sidebar pulling from incoming FKs.
- **FR-C04**: Money columns identified by name (`total`, `amount`, `price`, `subtotal`, `fee`, `tax`, columns ending in `_cents`) format with currency.
- **FR-C05**: Bulk actions, export, import, filter chips, saved views all work: same plumbing as Users/Content.

### Tasks archetype (FR-K01–FR-K04)

- **FR-K01**: `TasksAdmin` (list view) optionally groups rows by status when a status column with a small enum is detected.
- **FR-K02**: Each row card shows title, assignee avatar (when FK resolvable), priority chip (when present), due-date relative time, and status pill.
- **FR-K03**: `TaskDetail` shows status as a stepper (when the values are in a known workflow order), assignee + reporter relations as cards, and incoming FKs (sub-tasks, comments) in the sidebar.
- **FR-K04**: Bulk actions / export / import / filter chips / saved views all work.

### Messages archetype (FR-M01–FR-M04)

- **FR-M01**: `MessagesAdmin` renders as a vertical feed (not a card grid). Each row shows author label, body excerpt (line-clamped), thread depth indicator (when `parent_id` chain exists), and relative time.
- **FR-M02**: `MessageDetail` shows the full body as readable text, the author card, the parent message inline (when present), and reply count.
- **FR-M03**: When the table has a `thread_id` or `conversation_id` column, the list is sorted by thread + reverse-chronological by default.
- **FR-M04**: Bulk actions / export / import / filter chips / saved views all work.

### Surrounding UI (FR-S01–FR-S03)

- **FR-S01**: `groupTablesByArchetype` includes the new categories in friendly labels: Commerce → "Commerce", Tasks → "Workflow", Messages → "Conversations". The Dashboard, Tables list, and Schema view all render the new groups.
- **FR-S02**: The Dashboard stat strip surfaces tiles for the new categories when at least one matching table exists.
- **FR-S03**: Sidebar / command palette icons include lucide icons for each: `ShoppingCart` (commerce), `Kanban` (tasks), `MessageSquare` (messages).

## Success Criteria

- **SC-001**: A user with an `orders` table (no AI key) lands on `CommerceAdmin` automatically via heuristic classification.
- **SC-002**: Money column formatting is correct: `1234.56` renders as `$1,234.56` (USD default; currency hint from a `currency` column when present).
- **SC-003**: A `tasks` table with a `status` enum of `todo | in_progress | done` renders the status as a workflow stepper in the detail page.
- **SC-004**: A `comments` table with a `parent_id` self-FK renders with thread depth in the list.
- **SC-005**: `pnpm typecheck` + `pnpm build` pass; largest authenticated route stays ≤ 520 KB gz First Load JS.
- **SC-006**: No new dependencies added.
- **SC-007**: Heuristic fallback covers each new archetype without an OpenRouter key.

## Assumptions

- The v1.0 component family (PageHeader, StatTile, SelectionContext, BulkBar, ExportMenu, ImportPanel, FilterBar, ViewTabs) is reused across all three new archetypes.
- The new archetypes use the same `RowPresetRouter` dispatch pattern as Users/Content/Logs.
- Currency formatting uses `Intl.NumberFormat` with USD as default; if the user wants per-locale formatting, that's v1.2.
- Status pipeline / stepper rendering uses a small set of known workflow vocabularies (e.g. for commerce: `pending`, `paid`, `shipped`, `delivered`, `refunded`, `cancelled`). Unknown statuses fall back to a single chip.
- No new database tables. AI analysis cache (existing `schema_analysis` table) automatically handles the new category enum without migration.
