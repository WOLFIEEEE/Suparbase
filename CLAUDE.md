<!-- SPECKIT START -->
**Current**: v0.6.0 on `main` (tagged `v0.6.0`). Workspace UX overhaul:
archetype-grouped Dashboard, archetype-grouped Tables list, Content + Logs
presets rebuilt to the Users-archetype standard, Cmd+K command palette,
light/dark theme toggle with no-flash SSR cookie, sidebar polish. Includes
the AI prompt extension (`primary` / `hiddenColumns` / `relations`) that
every preset reads. CI shipped in v0.6.1 enforces typecheck + build on PR.

**In progress**: v0.7 on `007-power-data-ops`. Power-user data ops —
bulk select / bulk delete / bulk update, CSV+JSON export, CSV+JSON
import, inline cell editing, saved views per table, filter chips. One
new schema migration (`saved_views`). No new dependencies.
Active plan: [specs/007-power-data-ops/plan.md](specs/007-power-data-ops/plan.md).

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
- [specs/007-power-data-ops/](specs/007-power-data-ops/) — v0.7 (in progress), power-user data ops
<!-- SPECKIT END -->
