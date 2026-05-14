# Implementation Plan: Power-User Data Ops

**Branch**: `007-power-data-ops` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-power-data-ops/spec.md`

## Summary

v0.7 turns Suparbase from a viewer into a real data admin. Six features land
in one coherent cycle: bulk select + bulk delete + bulk update with one
auditable batch, CSV / JSON export that streams from the server, CSV / JSON
import with type validation + FK lookup + chunked inserts, inline cell
editing in the generic data grid, saved views persisted per
(user, connection, table), and filter chips driven by column headers. Every
mutation continues to route through the existing authenticated proxy and
records audit rows; nothing about the security model changes.

Technical approach in one paragraph: the work is mostly composition over
existing primitives: the proxy already streams reads and supports
PostgREST `in.()` filters, react-query already handles optimistic state,
the cmdk/Radix primitives cover the new dropdowns and popovers, the typed-
confirmation dialog and undo-toast already exist from v0.1. The only new
infrastructure is (a) a `saved_views` Drizzle table + tiny CRUD route, (b)
two new server endpoints for bulk delete and bulk update that compose
PostgREST `in.()` filters under the proxy's auth + audit + rate-limit
plumbing, (c) a small hand-rolled CSV streaming parser at `src/lib/csv/`
(no new dependency), (d) a `BulkBar` + `InlineCell` + `FilterChip` +
`ImportPanel` component family, all matching the v0.6 visual language.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), React 19, Next.js 15.5 (App Router).

**Primary Dependencies**: all already in the bundle: no new ones permitted
per the spec and the constitution's Technology Standards.
- `@tanstack/react-query` v5: list / row / count caches, optimistic
  updates for bulk + inline.
- `@radix-ui/react-dialog`: typed-confirm dialog (existing), import panel
  (sheet-style), filter popover.
- `@radix-ui/react-popover`: filter operator popover, FK picker in
  inline editor.
- `lucide-react`: icons.
- `zod` (already used by AI analysis): validates parsed JSON imports
  against the analysis schema.
- `sonner`: undo-toast for bulk delete (existing pattern).
- `drizzle-orm` + `drizzle-kit`: one new migration for `saved_views`.
- `class-variance-authority` + `tailwind-merge` + `clsx` via `cn()`.

**Storage**: one new Drizzle table `saved_views` (id, user_id,
connection_id, table_schema, table_name, name, state jsonb, created_at,
updated_at), indexed by `(user_id, connection_id, table_schema, table_name)`.
No other schema changes. Bulk delete + bulk update produce one
`audit_log` row per affected primary key (existing shape, no migration).

**Testing**: per the v0.6 precedent, automated UI tests are not part of
the project. The gating checks remain `tsc --noEmit`, `next build` (with
the bundle measurement assertion), and the manual smoke walk-through in
this spec's `quickstart.md`. The new CI workflow shipped in v0.6.1
enforces the first two on every PR.

**Target Platform**: Web: latest two stable versions of Chrome, Safari,
Firefox, Edge. Self-hostable Next.js standalone container.

**Project Type**: Single Next.js app. No new top-level directories.

**Performance Goals**: from Constitution Principle I (NON-NEGOTIABLE):
- 60 fps for scroll, list render, modal transitions on a 2020-era laptop.
- TTI ≤ 2.5 s on warm cache for any authenticated route.
- Total JS at first paint of any authenticated route ≤ 520 KB gzipped.
- v0.7 specifics: export of 5000 rows MUST not block the main thread > 100
  ms; bulk operations on > 1000 selected rows MUST chunk server-side, not
  client-side.

**Constraints**:
- NON-NEGOTIABLE Principle IV: every new interactive element keyboard-
  operable with visible focus; `prefers-reduced-motion` honoured (the
  success-flash and red-pulse on inline edit run only when motion is
  allowed).
- NON-NEGOTIABLE Principle V: every bulk + import row routes through
  `/api/v/[id]/rest/*` (or thin wrappers that compose it server-side);
  connection ownership verified before any write.
- NON-NEGOTIABLE Principle VII: bulk delete uses the existing typed-
  confirmation dialog; each affected row recorded in `audit_log`; new
  bulk-mutation routes get their own rate-limit bucket
  (`checkBulkRate`, 5 batches/minute/user).
- Principle VI: new modules placed under existing folders only · no new
  top-level directories. Server-only modules under `src/server/`.
- Constitution Technology: NO new dependencies. CSV parsing is hand-
  rolled in `src/lib/csv/`. JSON imports parse with native `JSON.parse` +
  a Zod validator built from the existing analyzed schema.

**Scale/Scope**: bulk operations capped at 5000 rows per batch; CSV
import capped at 50 MB / file; SavedViews capped at 5 per (user, table).
All trivially within budget.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| **I. Performance First** (NON-NEGOTIABLE) | ✅ PASS | Bulk ops use PostgREST `in.()` filters with `?id=in.(a,b,c)` so one chunk = one round-trip. Chunk size of 500 keeps URLs under typical 8 KB limits. Export and import stream: neither buffers the full payload. Inline editor uses optimistic react-query updates so the UI stays at 60 fps. No new client deps; CSV parser is ~150 lines streaming. SavedView state is small JSON (< 1 KB). Bundle delta projected at < 25 KB gz for the largest authenticated route, leaving ample headroom under the 520 KB budget. |
| **II. Motion Serves Comprehension** | ✅ PASS | The only new motion is (a) inline-edit success flash (~400ms accent-green; CSS transition gated by `prefers-reduced-motion`), (b) red-pulse on edit failure (same), (c) BulkBar slide-in (CSS transform). No GSAP introduced. |
| **III. Anti-AI-Slop Design** | ✅ PASS | New components reuse `PageHeader`, `StatTile`, `Button`, `Badge`, `DropdownMenu`, `Popover`: the v0.6 visual language. BulkBar is a sticky toolbar pinned to the bottom of the list (one accent action button); ImportPanel is a Radix Sheet; FilterChip is a Badge variant. No new color introduced. |
| **IV. Accessibility** (NON-NEGOTIABLE) | ✅ PASS | InlineCell uses `aria-readonly` on read-only cells, Tab/Shift+Tab traverses the row, Enter commits, Escape reverts. Filter popover uses Radix Popover (focus trap free; we manage `onOpenAutoFocus`). Bulk select checkboxes are `<input type="checkbox">` with proper labels. Undo toasts (Sonner) are already keyboard-operable. |
| **V. Server-Side Vault & Proxy** (NON-NEGOTIABLE) | ✅ PASS | New bulk endpoints (`POST /api/v/[id]/rest/[name]/bulk-delete`, `bulk-update`) live under the existing proxy hierarchy and inherit ownership verification + audit + rate-limit. Imports use the existing `/api/v/[id]/rest/[name]` POST endpoint per chunk. SavedView CRUD goes through a new authenticated route (`/api/views`) that verifies `connection.userId === session.user.id` on every read. |
| **VI. Clean Code Discipline** | ✅ PASS | New modules placed under existing folders. Server-only code under `src/server/proxy/bulk.ts`, `src/server/views/repo.ts`. Client components under `src/components/data/`. No new top-level directories. Old TableListView keeps working for tables that opt out via `?view=generic`. |
| **VII. Data & Security** (NON-NEGOTIABLE) | ✅ PASS | Bulk delete uses the existing `DeleteRowDialog` typed-confirm pattern (operator types the table name). Each affected row produces a separate `audit_log` row. New `checkBulkRate(userId)` bucket = 5 batches/min, tighter than single-write 60/min. CSV import sanitizes inputs before sending to PostgREST; values are inserted as JSON, not concatenated into SQL. The redactor in `src/lib/redact.ts` is unchanged and continues to strip JWT/sk-or-/sk-/bcrypt patterns from any error message. |
| **VIII. Account & Tenancy** | ✅ PASS | SavedView is keyed on `(user_id, connection_id, table_schema, table_name)`. Every CRUD route filters by `userId = session.user.id`. No cross-tenant access path. |
| **IX. AI Assistance** | ✅ PASS | This release adds no new LLM calls. Existing analysis output (`hiddenColumns`, `primary`, `relations`) is consumed by Export (skip hidden cols), Import (FK lookup hints), and InlineCell (read-only flagging). If the analysis cache is absent, every feature degrades to manual configuration without errors. |

**Gate result**: PASS. No violations to justify; Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/007-power-data-ops/
├── plan.md                       # This file
├── spec.md                       # Feature spec
├── research.md                   # Phase 0: design decisions resolved
├── data-model.md                 # Phase 1: types + saved_views schema
├── quickstart.md                 # Phase 1: manual smoke checklist
├── contracts/
│   ├── bulk-mutations.md         # POST /api/v/[id]/rest/[name]/bulk-{delete,update}
│   ├── export.md                 # GET /api/v/[id]/rest/[name]/export
│   ├── import.md                 # POST /api/v/[id]/rest/[name]/import (chunk)
│   └── views.md                  # GET/POST/PATCH/DELETE /api/views
└── checklists/
    └── requirements.md           # Spec quality checklist (already passed)
```

### Source Code (repository root)

```text
src/
├── app/
│   └── api/
│       ├── v/[id]/rest/[name]/
│       │   ├── bulk-delete/route.ts        # NEW: POST: chunks + audit + undo data
│       │   ├── bulk-update/route.ts        # NEW: POST: chunks + audit
│       │   ├── export/route.ts             # NEW: GET: streams rows as CSV or JSON
│       │   └── import/route.ts             # NEW: POST: accepts a chunk, inserts via PostgREST
│       └── views/
│           ├── route.ts                    # NEW: GET (list) + POST (create)
│           └── [id]/route.ts               # NEW: PATCH (rename/update) + DELETE
├── components/
│   ├── data/
│   │   ├── BulkBar.tsx                     # NEW: sticky toolbar w/ count + actions
│   │   ├── BulkUpdatePanel.tsx             # NEW: column picker + new value editor
│   │   ├── BulkDeleteDialog.tsx            # NEW: typed-confirm reused pattern
│   │   ├── ExportMenu.tsx                  # NEW: CSV / JSON dropdown
│   │   ├── ImportPanel.tsx                 # NEW: Sheet w/ drop + preview + mapping
│   │   ├── ImportPreviewTable.tsx          # NEW: rendered preview w/ mapping controls
│   │   ├── InlineCell.tsx                  # NEW: cell-level editor (text/num/date/bool/fk/enum)
│   │   ├── FilterChip.tsx                  # NEW: Badge variant w/ × button
│   │   ├── FilterPopover.tsx               # NEW: operator+value picker on column header
│   │   ├── SelectionContext.tsx            # NEW: client context for cross-pagination selection
│   │   ├── ViewTabs.tsx                    # NEW: tab strip + save/rename/delete
│   │   └── DataGrid.tsx                    # MODIFIED: integrate InlineCell + row checkboxes
│   ├── presets/
│   │   ├── UsersAdmin.tsx                  # MODIFIED: row checkboxes + BulkBar mount
│   │   ├── ContentAdmin.tsx                # MODIFIED: same
│   │   └── LogsAdmin.tsx                   # MODIFIED: row checkboxes (no bulk-update; bulk-delete OK)
│   └── workspace/
│       └── PageHeader.tsx                  # MODIFIED: optional <ViewTabs> slot
├── lib/
│   ├── csv/
│   │   ├── parse.ts                        # NEW: streaming CSV → row iterator
│   │   ├── serialize.ts                    # NEW: row iterator → CSV streaming
│   │   └── types.ts                        # NEW
│   ├── filters/
│   │   ├── operators.ts                    # NEW: operator → PostgREST mapping
│   │   ├── parse-url.ts                    # NEW: ?filter=col.op.val → ChipSpec[]
│   │   └── serialize-url.ts                # NEW: ChipSpec[] → URL params
│   ├── api/
│   │   ├── hooks.ts                        # MODIFIED: useBulkDelete, useBulkUpdate, useImport, useSavedViews
│   │   └── views.ts                        # NEW: fetch / mutate saved views
│   ├── pgrest/
│   │   ├── rows.ts                         # MODIFIED: accept ChipSpec[] in ListParams
│   │   └── bulk.ts                         # NEW: chunked DELETE / PATCH via `in.()`
│   └── types/
│       └── views.ts                        # NEW: SavedView + ViewState types
└── server/
    ├── proxy/
    │   ├── bulk.ts                         # NEW: orchestrate chunked PostgREST calls + audit fan-out
    │   ├── export.ts                       # NEW: stream pages + CSV/JSON encode
    │   ├── import.ts                       # NEW: chunked insert helper + per-row audit
    │   └── ratelimit.ts                    # MODIFIED: + checkBulkRate (5/min/user)
    ├── views/
    │   ├── repo.ts                         # NEW: Drizzle CRUD for saved_views
    │   └── schema.ts                       # NEW: Drizzle table definition
    └── schema/
        └── index.ts                        # MODIFIED: re-export views table

drizzle/
└── 0003_saved_views.sql                    # NEW: migration for saved_views
```

**Structure Decision**: Single Next.js app, no new top-level directories.
Server-only logic under `src/server/`, client UI under `src/components/`,
shared types/utilities under `src/lib/`. The new `src/components/data/`
subtree gathers the v0.7 cross-cutting widgets (BulkBar, InlineCell,
FilterChip, ImportPanel) so future archetypes can compose them. The
existing `TableListView` (generic grid) is the home for the inline-cell
work; archetype presets opt in to bulk + filter chips by mounting
`<BulkBar />` and the column-header click handlers.

## Complexity Tracking

No constitution violations to justify. Section intentionally empty.
