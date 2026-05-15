# Batch 3: persona pages + glossary (v1.9)

## Goal
Finish the planned 28-page content expansion. Four new use-case
pages and a new glossary surface with ten short-form definitions.

## Use cases (4 new)
- `indie-hackers`, solo founders shipping side projects
- `ai-startups`, RAG / agent product teams
- `healthcare-saas`, compliance-adjacent SaaS
- `ecommerce-operators`, order ops / customer support

Wired into the existing /use-cases hub via the registry.

## Glossary (10 entries at /learn/<slug>)
- rls
- jsonb
- mvcc
- rag
- hnsw
- pgvector
- connection-pooling
- vibe-coding
- postgrest
- audit-log

Each entry is a short, dense definition (~200-300 words) with a
"Read further" links section pointing to relevant articles, guides,
and comparison pages.

## Infrastructure
- New `src/lib/learn/registry.ts` mirrors the other content registries.
- `/learn` hub groups entries by category (Postgres / Supabase / AI /
  Patterns / Vibe-coding).
- `/learn/<slug>` dynamic route with `generateStaticParams` and
  per-page metadata (canonical, OG, JSON-LD breadcrumb).
- Sitemap and PublicFooter Resources column updated.

## End-state surface
After v1.9, the public content library is:
- 30 blog articles
- 9 head-to-head comparison pages
- 4 step-by-step guides
- 7 use-case landing pages
- 10 glossary entries
- 8 marketing pages (home, features, pricing, docs, changelog,
  about, privacy, terms)
- = **68 pages**, each with proper metadata, canonical URLs,
  Open Graph + Twitter cards, and JSON-LD structured data.
