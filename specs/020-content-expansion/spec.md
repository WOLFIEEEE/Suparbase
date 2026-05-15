# Content expansion: vibe-coding-era database content (v1.6)

## Goal
Broaden the content library beyond Suparbase-specific deep dives. Add
generic technical content (database comparisons, decision guides, edge
DB landscape) that targets the search intent of developers building in
2026's AI-assisted ("vibe-coded") era. Some pieces link back to
Suparbase; many don't.

## Why now
v1.5 shipped a focused set of 8 technical articles that all assume the
reader already knows what Supabase is. To reach a wider audience: people
googling "best database for vibe coding", "MongoDB vs Postgres 2026",
"vector database ranked", etc., we need:

1. Broader topic coverage (not Supabase-first).
2. Comparison content (head-to-head pages with strong search intent).
3. Decision-framework pieces for new developers picking a stack.

The technical bar stays: every article is opinionated, written by
someone who has shipped in the space, and avoids keyword stuffing.

## Articles (8 new)

Each at 1500-2200 words. Server React components under
`src/lib/blog/content/<slug>.tsx`. Same shape as v1.5 articles: typed
meta export with toc + tags + related, plus an `Article()` function.

| Slug | Notes |
|---|---|
| `which-database-for-vibe-coding-2026` | The "I'm starting a new project, what database?" decision guide |
| `mongodb-vs-postgres-2026` | Honest comparison, not a hit piece. Includes when MongoDB wins. |
| `best-ai-friendly-database-2026` | What makes a DB easy for AI agents to operate |
| `vector-databases-ranked-2026` | pgvector, Pinecone, Qdrant, Weaviate, LanceDB, Chroma, Milvus |
| `sqlite-at-the-edge-2026` | SQLite renaissance, Turso, D1, libSQL |
| `vibe-coding-database-patterns` | 10 patterns that survive AI-paired DB work |
| `why-supabase-for-ai-agents` | Schema introspection + RLS + JWT claims |
| `edge-databases-comparison-2026` | Turso vs D1 vs Neon side-by-side |

## Comparison pages (3)

Short, opinionated head-to-head pages with strong intent-match SEO.
Each ~600-900 words. Routed under `/compare/<slug>` with a hub at
`/compare`. Structure:
- One-paragraph TL;DR up top with a "winner for X / winner for Y" call.
- Five-row feature matrix (table).
- "When each one wins" two-column section.
- One-paragraph honest conclusion.

| Slug | Comparison |
|---|---|
| `supabase-vs-firebase` | Open-source Postgres+RLS vs Google's NoSQL bundle |
| `postgres-vs-mongodb` | The classic; with the 2026 context |
| `supabase-vs-neon` | Two Postgres-on-the-edge plays |

## Infrastructure

New:
- `src/lib/compare/registry.ts` (mirrors `use-cases/registry.ts`)
- `src/lib/compare/content/<slug>.tsx` (one per page)
- `src/app/compare/page.tsx` (hub)
- `src/app/compare/[slug]/page.tsx` (dynamic)
- Sitemap updated to include `/compare/*`
- `PublicFooter` Resources column gains a "Compare" link
- `PublicNav` stays at 5 links (we don't add another top-level entry;
  the comparison pages are deep-link targets from blog + footer)

## Out of scope

- Glossary pages (`/learn/rls` etc.), defer to v1.7 if needed.
- Tag pages, author pages, RSS, defer.
- Long-form ebooks / PDF guides, defer.
