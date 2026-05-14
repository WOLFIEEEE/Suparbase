# Tasks: AI-augmented admin presets

## Phase 1: DB + vault generalization
- [ ] T001 New Drizzle schemas `src/server/schema/user-settings.ts`, `schema-analysis.ts`; re-export from `schema/index.ts`
- [ ] T002 Add `redact()` rules for `sk-or-…` and `sk-…` patterns in `src/lib/redact.ts`
- [ ] T003 Generate Drizzle migration (`pnpm db:generate`)

## Phase 2: AI server module
- [ ] T010 `src/server/ai/openrouter.ts`: fetch wrapper with key probe (`/models`) and Chat Completions call
- [ ] T011 `src/server/ai/fingerprint.ts`: SHA-256 of sorted schema lines
- [ ] T012 `src/server/ai/prompt.ts`: system + user prompt builders
- [ ] T013 `src/server/ai/responseSchema.ts`: Zod schemas for the JSON response
- [ ] T014 `src/server/ai/heuristic.ts`: fallback classifier (mirrors `src/lib/presets/heuristic.ts` server-side for consistency)
- [ ] T015 `src/server/ai/analyze.ts`: orchestrator: cache → AI or heuristic → cache → return
- [ ] T016 `src/server/settings/repo.ts`: CRUD for `user_settings`

## Phase 3: API routes
- [ ] T020 `src/app/api/settings/ai/route.ts`: GET / PUT / DELETE
- [ ] T021 `src/app/api/ai/analyze/[id]/route.ts`: GET (cached only) / POST (run; respects rate limit)
- [ ] T022 Extend rate limiter with an `ai` bucket: 10/hour/user

## Phase 4: Settings UI
- [ ] T030 Server page `src/app/(auth)/settings/ai/page.tsx`
- [ ] T031 Client `src/components/settings/AiSettingsForm.tsx`: key input, model picker, re-analyze button
- [ ] T032 Connect `/settings` from top-bar / sidebar

## Phase 5: Preset framework
- [ ] T040 `src/lib/types/analysis.ts`
- [ ] T041 `src/lib/presets/heuristic.ts`
- [ ] T042 `src/lib/presets/pick.ts`
- [ ] T043 `src/components/presets/GenericAdmin.tsx` (refactor: existing TableListView is the contents)
- [ ] T044 `src/components/presets/UsersAdmin.tsx`
- [ ] T045 `src/components/presets/ContentAdmin.tsx`
- [ ] T046 `src/components/presets/LogsAdmin.tsx`
- [ ] T047 `src/components/workspace/PresetSwitcher.tsx`
- [ ] T048 Wire `src/app/(auth)/c/[id]/tables/[name]/page.tsx` to resolve + lazy-load the preset

## Phase 6: Dashboard wiring
- [ ] T050 Fetch cached analysis on dashboard server render (best-effort: just read the cache row if present)
- [ ] T051 Pass analysis down to `TableTile`; render the category badge + display name

## Phase 7: Polish & verify
- [ ] T060 README: AI section + screenshots
- [ ] T061 Final `pnpm typecheck` clean
- [ ] T062 Final `pnpm build`: diff vs v0.2; landing budget unchanged, workspace budget within +30 KB gz
- [ ] T063 Smoke checklist update: add: connect with no key → generic; add key → analysis runs once → presets appear
