# SEO content & technical articles (v1.5)

## Goal
Give Suparbase an actual content surface: a blog of long-form
technical articles on trending 2026 Postgres / Supabase topics, plus
use-case landing pages, plus the SEO infrastructure (sitemap, robots,
Open Graph, JSON-LD) to make them findable.

The articles are the primary point of this release. They are not
keyword-stuffed marketing. They are practical, technically accurate,
opinionated pieces written for the engineer who would actually want
this product. Each one stands on its own and is something we'd
ourselves send to a colleague.

## Content plan

### Articles (8)

Each article is a server component under
`src/lib/blog/content/<slug>.tsx`. Targets ~1500-2500 words. Each
links naturally to one or two relevant Suparbase features (RLS
debugger, SQL playground, AI chat, etc.) without sounding like an
ad.

| Slug | Title | Search intent |
|---|---|---|
| `row-level-security-postgres-2026` | RLS guide | "postgres rls", "supabase rls best practices" |
| `supabase-vs-self-hosted-postgres` | Hosted vs DIY | "supabase vs postgres", "when to leave supabase" |
| `multi-tenant-saas-postgres` | Multi-tenant | "multi-tenant supabase", "postgres tenant isolation" |
| `pgvector-rag-production` | pgvector RAG | "pgvector production", "supabase rag" |
| `zero-downtime-migrations` | Migrations | "postgres zero downtime migration", "supabase migration" |
| `ai-assisted-database-admin` | AI ops | "ai database admin", "text to sql production" |
| `jsonb-vs-tables` | Schema design | "jsonb vs columns", "when to use jsonb" |
| `postgres-connection-pooling-2026` | Pooling | "supavisor", "pgbouncer", "postgres serverless pooling" |

### Use cases (3)

Each is a single-page landing under `src/app/use-cases/[slug]/page.tsx`.

- `saas-admin`: solo founder running a Supabase-backed SaaS.
- `agency-multi-client`: agency or consultant managing many client
  projects from one workspace.
- `internal-tools`: company building internal back-office tools on
  Supabase without commissioning custom apps.

## SEO infrastructure

- `src/app/sitemap.ts` (Next metadata route): emits sitemap.xml for
  every public route — static pages, articles, use-cases.
- `src/app/robots.ts`: emits robots.txt allowing public routes,
  disallowing `/api`, `/c/*`, `/connections`, `/settings`, the auth
  paths.
- Per-page `generateMetadata()` for dynamic routes; static
  `metadata` exports elsewhere. All set `title`, `description`,
  `openGraph` (title + description + url + siteName + type),
  `twitter` (summary_large_image card), `alternates.canonical`.
- `src/components/public/JsonLd.tsx`: helper for `Article` and
  `Organization` structured data. Articles emit JSON-LD with
  headline, datePublished, author, publisher, dateModified.

## Article rendering

- Re-uses the existing `Prose` component for typography (h2/h3, ul,
  ol, code, p, strong, links).
- Adds `CodeBlock` (server component with syntax-naive but
  themable styling) and `Callout` (`tip` / `watch-out` / `note`
  variants) primitives in `src/components/public/article-bits.tsx`.
- `src/components/public/ArticleLayout.tsx` wraps each article
  with: sticky-top sidebar listing the article's headings (TOC
  generated from the article's exported `toc` array), a hero header
  with title/date/reading time, the article body, a "related
  articles" footer, and a CTA band.

## Routing

- `/blog` (article hub, server-rendered grid)
- `/blog/[slug]` (dynamic, `generateStaticParams` over the article
  registry)
- `/use-cases` (hub)
- `/use-cases/[slug]` (dynamic)

Nav: PublicNav gains a `Blog` link between `Docs` and `Changelog`.

## Out of scope (v1.5)

- MDX / runtime markdown pipeline. Articles are first-class TSX
  components.
- Comments / discussions.
- Tag pages.
- Author pages (single-author release).
- Image-heavy posts (text-first, code-heavy by design).
