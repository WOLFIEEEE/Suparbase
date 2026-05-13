# Implementation Plan: v1.0 Polish + v0.7 Final

**Branch**: `008-v1-polish` | **Date**: 2026-05-14 | **Spec**: [spec.md](./spec.md)

## Summary

Six coordinated workstreams ship as v1.0:

1. **Typography unification** — drop Fraunces; use Inter Variable for both body and display via a tighter-tracking utility.
2. **Generic admin lift** — `TableListView` v2 (row cards), `TableRowView` v2 (hero + sectioned + sidebar), new-row page wrapped in `PageHeader`.
3. **Schema view rebuild** — archetype groupings + expandable tables + FK chips.
4. **Connection flow polish** — `ConnectionList` card grid, narrower new-connection form, grouped settings page.
5. **v0.7 final** — filter chips (US6), saved views (US5), inline cell editing (US4), reusing the v0.7-MVP foundational primitives (ChipSpec, saved_views table, SelectionContext).
6. **Polish pass** — tooltip coverage on icon buttons, consistent `EmptyState` everywhere, skeleton coverage on every async surface.

## Technical Context

**Stack** unchanged: TypeScript 5.9, React 19, Next.js 15.5, Tailwind 3, Radix, `@tanstack/react-query`, Drizzle, no new dependencies.

**Schema** unchanged. `saved_views` migration shipped in v0.7 MVP.

**New API routes** (the v0.7 backlog the MVP deferred):
- `GET /api/views?connectionId=…&schema=…&table=…` — list
- `POST /api/views` — create
- `PATCH /api/views/[id]` — rename / update state
- `DELETE /api/views/[id]` — delete

**New + modified components** (approx 22 files):

```
src/
  app/
    api/views/route.ts                      NEW
    api/views/[id]/route.ts                 NEW
    layout.tsx                              MODIFIED (font load)
  components/
    workspace/
      TableListView.tsx                     REWRITTEN (row cards + bulk + filter chips + inline)
      TableRowView.tsx                      REWRITTEN (hero + sidebar — mirror UserDetail)
      RowPresetRouter.tsx                   MODIFIED (generic branch dispatches GenericDetail)
      SchemaView.tsx                        REWRITTEN
      ConnectionSettings.tsx                REWRITTEN (grouped sections)
      Topbar.tsx                            MODIFIED (tooltips on icon buttons)
    presets/
      GenericAdmin.tsx                      MODIFIED (no behaviour change but reflects v2 grid)
      GenericDetail.tsx                     NEW (mirror of UserDetail for generic rows)
    data/
      FilterPopover.tsx                     NEW
      FilterChip.tsx                        NEW
      InlineCell.tsx                        NEW
      ViewTabs.tsx                          NEW
      DataGridRow.tsx                       NEW (row card used by generic + new-row)
      EditableField.tsx                     NEW (in-place editor common to inline + new-row)
    connections/
      ConnectionList.tsx                    REWRITTEN (card grid + counts + last-used)
      ConnectionForm.tsx                    MODIFIED (PageHeader + paste-hint)
    auth/
      <unchanged>
    ui/
      tooltip.tsx                           EXISTING (re-use)
  lib/
    api/views.ts                            NEW (react-query wrappers for /api/views)
    presets/groupTables.ts                  EXISTING (re-use in schema view)
  app/(auth)/c/[id]/
    tables/[name]/page.tsx                  MODIFIED (route dispatcher only)
    tables/[name]/new/page.tsx              MODIFIED (PageHeader wrap)
    schema/page.tsx                         MODIFIED (calls SchemaView v2)
    settings/page.tsx                       MODIFIED (calls ConnectionSettings v2)
```

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| **I. Performance First** | ✅ PASS | Removing Fraunces is a net bundle reduction. Inline editor uses optimistic react-query; filter chips reuse the v0.7 MVP foundation; saved views are tiny JSON blobs. No new client deps. |
| **II. Motion Serves Comprehension** | ✅ PASS | New motion is limited to the inline-edit success flash and chip hover transitions; all CSS, all reduced-motion-gated. |
| **III. Anti-AI-Slop Design** | ✅ PASS | Unified Inter still satisfies "deliberate typography" (the constitution forbids generic system stacks, not serifs specifically). The accent + hairline + layout discipline is preserved. The v1.0 visual language is closer to Linear / Vercel and further from "another shadcn template" with the row-card pattern + custom chrome. |
| **IV. Accessibility** (NON-NEGOTIABLE) | ✅ PASS | New chips, inline editor, filter popover all built on Radix Popover / Dialog / Select. Tooltips on every icon button via Radix Tooltip. Keyboard nav verified in the v0.7 spec's quickstart. |
| **V. Server-Side Vault & Proxy** (NON-NEGOTIABLE) | ✅ PASS | All four new `/api/views` routes verify session + ownership. No new proxy surface. |
| **VI. Clean Code Discipline** | ✅ PASS | New components placed under existing folders; `EditableField` factored so inline-cell and new-row form share the editor logic (second concrete caller). The old TableListView delete + replace fits the constitution's "no dead code" rule once the new is in place. |
| **VII. Data & Security** (NON-NEGOTIABLE) | ✅ PASS | Inline edits route through `useUpdateRow`. Saved-view payloads are JSON validated server-side. No new credential surfaces. |
| **VIII. Account & Tenancy** | ✅ PASS | `saved_views` is keyed per (user, connection, schema, table); every CRUD route filters on `userId`. |
| **IX. AI Assistance** | ✅ PASS | New surfaces consume analysis-derived `hiddenColumns` + `primary` exactly like the archetypes do. Heuristic fallback covers the no-AI case. |

PASS overall. No new violations.

## Complexity Tracking

No constitution violations. Section intentionally empty.
