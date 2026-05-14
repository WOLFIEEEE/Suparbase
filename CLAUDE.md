<!-- SPECKIT START -->
**Current**: v1.2.0 on `main` (tagged `v1.2.0`). Five major features
landed together: inline cell editing, global row search in the command
palette, per-row history panel with column-level diffs, AI write
actions with a confirm-before-execute diff card, and an RLS policy
debugger that simulates requests inside a rolled-back transaction.

Read for stack, structure, constraints, and budgets before editing:

- Constitution (v3.2.0): [.specify/memory/constitution.md](.specify/memory/constitution.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Quickstart (local): see README "Local development" section
- Coolify deploy: see README "Deploy on Coolify" section

Spec-kit features (chronological):

- [specs/001-supabase-admin/](specs/001-supabase-admin/) — v0.1, Vite SPA (history)
- [specs/002-suparbase-saas/](specs/002-suparbase-saas/) — v0.2, Next.js SaaS
- [specs/003-ai-augmented-admin/](specs/003-ai-augmented-admin/) — v0.3, AI presets
- [specs/004-deploy-coolify/](specs/004-deploy-coolify/) — v0.4, Coolify deploy
- [specs/005-bootstrap-and-credentials/](specs/005-bootstrap-and-credentials/) — v0.5, self-bootstrap + email/password auth
- [specs/006-product-workspace/](specs/006-product-workspace/) — v0.6, workspace UX overhaul (shipped)
- [specs/007-power-data-ops/](specs/007-power-data-ops/) — v0.7 MVP, power-user data ops (bulk + export + import)
- [specs/008-v1-polish/](specs/008-v1-polish/) — v1.0, polish release + v0.7 final (saved views + filter chips)
- [specs/010-more-archetypes/](specs/010-more-archetypes/) — v1.1, archetype taxonomy widened (commerce + tasks + messages)
- [specs/011-inline-cell-editing/](specs/011-inline-cell-editing/) — v1.2, click-to-edit values on the row detail page
- [specs/012-global-row-search/](specs/012-global-row-search/) — v1.2, Cmd-K search across every table in parallel
- [specs/013-row-history/](specs/013-row-history/) — v1.2, audit-log diffs surfaced on every detail page
- [specs/014-ai-write-actions/](specs/014-ai-write-actions/) — v1.2, AI assistant drafts writes; user confirms in a diff card
- [specs/015-rls-debugger/](specs/015-rls-debugger/) — v1.2, RLS policy browser + simulator (needs direct Postgres URL)
<!-- SPECKIT END -->
