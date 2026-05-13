# Tasks: v1.0 Polish + v0.7 Final

Execution-ordered task list for [spec.md](./spec.md) + [plan.md](./plan.md). No /speckit-clarify or /speckit-analyze cycle for this release — the scope is explicit and the foundation is in place from v0.7 MVP.

## Phase 1 — Setup

- [ ] T001 Baseline `pnpm typecheck` clean.

## Phase 2 — Typography unification

- [ ] T002 Update `src/app/globals.css`: remove the `@import "@fontsource-variable/fraunces/index.css"` line. Drop any `font-family: 'Fraunces'` rules. Update the `.font-display` utility (or Tailwind config `font-display` mapping) so it resolves to Inter Variable at heavier weight (700) with tracking `-0.025em`.
- [ ] T003 Verify Tailwind `tailwind.config.ts` `theme.extend.fontFamily.display` maps to `Inter Variable` (was Fraunces).
- [ ] T004 `pnpm remove @fontsource-variable/fraunces` to drop the package entirely; verify it's the only place Fraunces was loaded.

## Phase 3 — Filter chips foundation (US6 from v0.7)

- [ ] T005 [P] Create `src/components/data/FilterPopover.tsx` — Radix Popover that opens off a column-header click. Operators come from `OPERATORS_FOR_TYPE` (lib/filters/operators.ts). Submits a `ChipSpec` via prop.
- [ ] T006 [P] Create `src/components/data/FilterChip.tsx` — Badge variant rendering `column op value` with a focusable × button.
- [ ] T007 [P] Create `src/components/data/FilterBar.tsx` — toolbar row showing the active chips parsed from the URL via `parseFilterParams`; mounted just under the toolbar in each preset.

## Phase 4 — Saved views (US5 from v0.7)

- [ ] T008 [P] Create `src/app/api/views/route.ts`: GET (list) + POST (create). Validates body with the SavedView shape + connection ownership; cap at 5 per (user, connection, table).
- [ ] T009 [P] Create `src/app/api/views/[id]/route.ts`: PATCH (rename/update state) + DELETE.
- [ ] T010 [P] Create `src/lib/api/views.ts`: react-query hooks `useSavedViews`, `useCreateView`, `useUpdateView`, `useDeleteView`.
- [ ] T011 Create `src/components/data/ViewTabs.tsx` — tab strip with "All" + each saved view + a "Save view" button. Active tab reflected in URL. Depends on T008-T010.
- [ ] T012 Extend `src/components/workspace/PageHeader.tsx` to accept an optional `tabs?: React.ReactNode` slot. Mount `<ViewTabs />` in each preset's PageHeader.

## Phase 5 — Inline cell editing (US4 from v0.7)

- [ ] T013 [P] Create `src/components/data/EditableField.tsx` — a generic field editor (text/number/date/datetime/bool/select) factored out so it can be shared by inline cells and the new-row form.
- [ ] T014 Create `src/components/data/InlineCell.tsx` — click-to-edit cell wrapper using `EditableField`, with optimistic update via `useUpdateRow`. Handles Enter (commit), Escape (revert), Tab (next editable cell). Depends on T013.

## Phase 6 — Generic admin lift

- [ ] T015 [P] Create `src/components/data/DataGridRow.tsx` — generic row-card matching the archetype shape (selection checkbox + identity column + secondary chips + action menu).
- [ ] T016 Rewrite `src/components/workspace/TableListView.tsx`:
  - Use `PageHeader` (breadcrumbs, AI eyebrow, title, toolbar with Export + Import + Refresh + New).
  - Replace HTML `<table>` with `DataGridRow` cards.
  - Mount `<SelectionProvider>` + `<BulkBar>`.
  - Mount `<FilterBar>` showing active chips.
  - Mount `<ViewTabs>` in the PageHeader.
  - Mount `<ImportPanel>` (writable tables only).
  - Click row navigates to detail page (no drawer).
  - Depends on T015, T011, T012, T014.
- [ ] T017 [P] Create `src/components/presets/GenericDetail.tsx` — mirror of `UserDetail.tsx` for generic-classified rows. Hero card surfaces the analysis title column (or PK), sectioned identity fields respect `hiddenColumns`, linked-records sidebar from incoming FKs.
- [ ] T018 Update `src/components/workspace/RowPresetRouter.tsx` to dispatch `preset === "generic"` to `GenericDetail` instead of falling through to the old `TableRowView`.
- [ ] T019 Delete `src/components/workspace/TableRowView.tsx` once T018 is in place (no other callers). Confirm with `rg "TableRowView" src/`.
- [ ] T020 Update `src/app/(auth)/c/[id]/tables/[name]/new/page.tsx` to wrap `RowForm` in `PageHeader` chrome with breadcrumbs back to the table.

## Phase 7 — Schema view rebuild

- [ ] T021 Rewrite `src/components/workspace/SchemaView.tsx`:
  - `PageHeader` chrome with column-count eyebrow.
  - `groupTablesByArchetype` to group tables.
  - Each table = expandable `<details>` showing columns grouped (Identifiers / Fields / Metadata).
  - FK columns rendered as clickable chips linking to the referenced table.
  - System tables collapsed under a disclosure.

## Phase 8 — Connection flows polish

- [ ] T022 Rewrite `src/components/connections/ConnectionList.tsx` — card grid (already cards but redesign each card): friendly name + hostname + role chip + last-used relative time + a "X tables" stat (when introspection cache is warm). Hover reveals an action menu.
- [ ] T023 Modify `src/components/connections/ConnectionForm.tsx` and `src/app/(auth)/(account)/connections/new/page.tsx`: wrap in `PageHeader`, add a "Paste from Supabase dashboard" eyebrow with brief guidance, narrow form width.
- [ ] T024 Rewrite `src/components/workspace/ConnectionSettings.tsx` — three grouped surface cards: Identity (rename), Security (role display + key rotation hint), Danger Zone (delete).

## Phase 9 — Tooltip + polish pass

- [ ] T025 [P] Audit every icon-only button across `Topbar`, `BulkBar`, `ExportMenu`, `ImportPanel`, preset toolbars, row action menus, schema view. Wrap each in `<Tooltip>` with the action name. Use the existing `src/components/ui/tooltip.tsx` primitive.
- [ ] T026 [P] Audit every empty state. Convert ad-hoc "No X" `<div>`s to the shared `EmptyState` component. Each gets a title + description + (when applicable) a primary action.
- [ ] T027 [P] Audit every async surface for skeleton coverage. Add `<Skeleton>` placeholders matching the shape of the loaded content where they're missing.
- [ ] T028 Audit `prefers-reduced-motion` coverage for new motion (filter popover animation, inline-edit success flash, view-tab transitions). Verify via media query in CSS.

## Phase 10 — Release

- [ ] T029 Constitution amendment to v3.3.0 in `.specify/memory/constitution.md` noting the v1.0 release; no NON-NEGOTIABLE relaxed.
- [ ] T030 Update `CHANGELOG.md` with a v1.0.0 entry covering this release.
- [ ] T031 Update `README.md`: bump version badge to `v1.0.0`, add "What's new in v1.0" lead, extend Spec-Kit artifacts to include 007 + 008.
- [ ] T032 Bump version in `package.json` from `0.5.0` to `1.0.0`.
- [ ] T033 Update `CLAUDE.md` to reflect v1.0 as Current.
- [ ] T034 `pnpm typecheck` clean.
- [ ] T035 `pnpm build` clean; record largest authenticated route bundle.
- [ ] T036 Commit on `008-v1-polish`; push; open PR to main.
- [ ] T037 Wait for CI green; merge PR with a real merge commit.
- [ ] T038 Tag `v1.0.0`; push tag; create GitHub Release with formatted notes.
- [ ] T039 Cleanup: sync local main, delete the merged branch locally + remotely, prune stale refs.

---

## Dependencies

```
T001 Setup
  ↓
T002–T004 Typography (independent of everything else)
T005–T007 Filter chips foundation
T008–T012 Saved views (needs T011 ← T010 ← T008–T009)
T013–T014 Inline editing (T014 ← T013)
T015 Row card primitive
  ↓
T016 TableListView v2 (needs T015, T011, T014, FilterBar T007)
T017–T020 Generic detail + router dispatch + cleanup
T021 Schema view (independent)
T022–T024 Connection flows (independent)
T025–T028 Polish pass (parallel after the new components exist)
T029–T039 Release
```

Most of Phases 3-8 can run in parallel between developers; in this solo execution, working in order keeps mental context simple.
