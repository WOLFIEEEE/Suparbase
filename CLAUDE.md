<!-- SPECKIT START -->
**Current**: v2.2.0 on `main` (tagged `v2.2.0`). Dashboards: per-
connection widget registry (KPI tiles, bar / line charts, lists)
backed by saved SQL queries. Hand-written SVG charts, ≤ 24 widgets
per connection, optional auto-refresh, 5s read-only timeout per
widget. Editor at `/c/[id]/dashboard/edit`; widgets render on the
connection home above the table groups. Second of four releases
(v2.1 → v2.4) closing the "we'll just build our own panel" gap
(impersonation / teams come next).

Read for stack, structure, constraints, and budgets before editing:

- Constitution (v3.2.0): [.specify/memory/constitution.md](.specify/memory/constitution.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Quickstart (local): see README "Local development" section
- Coolify deploy: see README "Deploy on Coolify" section

Spec-kit features (chronological):

- [specs/001-supabase-admin/](specs/001-supabase-admin/) · v0.1, Vite SPA (history)
- [specs/002-suparbase-saas/](specs/002-suparbase-saas/) · v0.2, Next.js SaaS
- [specs/003-ai-augmented-admin/](specs/003-ai-augmented-admin/) · v0.3, AI presets
- [specs/004-deploy-coolify/](specs/004-deploy-coolify/) · v0.4, Coolify deploy
- [specs/005-bootstrap-and-credentials/](specs/005-bootstrap-and-credentials/) · v0.5, self-bootstrap + email/password auth
- [specs/006-product-workspace/](specs/006-product-workspace/) · v0.6, workspace UX overhaul
- [specs/007-power-data-ops/](specs/007-power-data-ops/) · v0.7 MVP, power-user data ops (bulk + export + import)
- [specs/008-v1-polish/](specs/008-v1-polish/) · v1.0, polish release + v0.7 final (saved views + filter chips)
- [specs/010-more-archetypes/](specs/010-more-archetypes/) · v1.1, archetype taxonomy widened (commerce + tasks + messages)
- [specs/011-inline-cell-editing/](specs/011-inline-cell-editing/) · v1.2, click-to-edit values on the row detail page
- [specs/012-global-row-search/](specs/012-global-row-search/) · v1.2, Cmd-K search across every table in parallel
- [specs/013-row-history/](specs/013-row-history/) · v1.2, audit-log diffs surfaced on every detail page
- [specs/014-ai-write-actions/](specs/014-ai-write-actions/) · v1.2, AI assistant drafts writes; user confirms in a diff card
- [specs/015-rls-debugger/](specs/015-rls-debugger/) · v1.2, RLS policy browser + simulator (needs direct Postgres URL)
- [specs/016-storage-browser/](specs/016-storage-browser/) · v1.3, Supabase Storage bucket + object browser with signed URLs
- [specs/017-auth-users/](specs/017-auth-users/) · v1.3, auth.users admin page (invite / recover / ban / delete)
- [specs/018-sql-playground/](specs/018-sql-playground/) · v1.4, read-only-by-default SQL editor + results table
- [specs/019-seo-content/](specs/019-seo-content/) · v1.5, content + SEO release: blog, use-cases, sitemap, JSON-LD
- [specs/020-content-expansion/](specs/020-content-expansion/) · v1.6, eight vibe-coding-era articles + three comparison pages
- [specs/024-ai-chat-v2/](specs/024-ai-chat-v2/) · v2.0, AI chat overhaul: persistent conversations + 3 new tools + page context + markdown
- [specs/025-custom-actions/](specs/025-custom-actions/) · v2.1, custom actions (SQL / webhook buttons surfaced on tables + rows)
- [specs/026-dashboards/](specs/026-dashboards/) · v2.2, connection dashboards (KPI / bar / line / list widgets with SVG charts)
<!-- SPECKIT END -->
