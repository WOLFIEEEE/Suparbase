# Batch 1: more comparisons + tutorial guides (v1.7)

## Goal
Ship Batch 1 of the planned 28-page content expansion. Six new
head-to-head comparison pages and a brand-new tutorial-guides section
with four step-by-step recipes. All built on the existing /compare
and a new /guides surface.

## Routes added
- 6 new comparison pages under `/compare/<slug>`:
  - supabase-vs-pocketbase
  - postgres-vs-mysql-2026
  - drizzle-vs-prisma
  - pgvector-vs-pinecone
  - supabase-auth-vs-clerk
  - supabase-vs-convex
- New `/guides` hub.
- New `/guides/<slug>` dynamic route with `generateStaticParams` and
  per-page metadata (canonical, OG, Twitter, JSON-LD Article + breadcrumb).
- 4 initial guides:
  - setup-supabase-with-cursor (Beginner, 5min)
  - add-rls-to-existing-database (Intermediate, 30min)
  - first-rag-app-with-pgvector (Intermediate, 90min)
  - multi-tenant-supabase-in-a-day (Intermediate, 4h)

## Shape
- Comparison pages keep the existing v1.6 shape: TL;DR card, "winner
  for X" callouts, feature matrix table, "when each one wins"
  sections, honest closing take.
- Guides have a new shape: a `GuideMeta` with `level`,
  `readingMinutes`, `timeMinutes`, `steps`, and a `Body` server
  component. The page renders a sticky steps-sidebar with numbered
  TOC, a difficulty tag in the header, and a "more guides" footer.
- Sitemap, PublicFooter Resources column updated.

## Out of scope (this release)
- The remaining 14 long-form articles (Batch 2, v1.8).
- The 4 new persona pages + glossary (Batch 3, v1.9).
