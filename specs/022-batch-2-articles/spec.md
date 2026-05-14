# Batch 2: 14 authority articles (v1.8)

## Goal
Ship the long-form authority pieces. 14 new articles across vibe-coding
practice, Postgres deep-dives, ops, and architecture. Brings the blog
total to 30.

## Articles

### Vibe-coding practice (5)
- ai-code-review-for-database-prs
- cursor-plus-supabase-2026
- when-ai-shouldnt-touch-your-database
- type-safe-database-for-ai-paired-code
- capping-ai-database-costs

### Postgres deep-dives (5)
- postgres-explain-analyze-2026
- postgres-indexes-explained-2026
- postgres-mvcc-when-it-bites
- postgres-full-text-search-2026
- postgres-partitioning-at-scale

### Operations (2)
- database-backups-2026
- postgres-observability-stack-2026

### Architecture (2)
- postgrest-vs-graphql-vs-trpc
- event-driven-on-postgres-2026

## Shape
- Same article shape as v1.5 / v1.6: typed meta, TOC array, related
  articles, server component body using Prose + CodeBlock + Callout +
  ArticleH2 primitives.
- Each one is ~1500-2000 words, technically real, opinionated.
- All wired into `src/lib/blog/articles.ts` registry; sitemap picks
  them up automatically via `listArticles()`.

## Out of scope
- The 4 new persona pages + glossary (Batch 3, v1.9).
