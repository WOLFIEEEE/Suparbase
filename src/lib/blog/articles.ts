import type React from "react";

export interface TocEntry {
  id: string;
  label: string;
}

export interface ArticleMeta {
  slug: string;
  title: string;
  /** SEO description (140-160 chars). */
  description: string;
  /** ISO date string. */
  publishedAt: string;
  /** Optional ISO date when the article was meaningfully revised. */
  updatedAt?: string;
  /** Estimated reading time, in minutes. */
  readingMinutes: number;
  /** Short tag set used for filtering on the hub. */
  tags: ReadonlyArray<string>;
  /** Slugs of related articles to surface in the footer. */
  related?: ReadonlyArray<string>;
  /** Table of contents — H2 ids + labels. Used by ArticleLayout. */
  toc: ReadonlyArray<TocEntry>;
  /** The article body — a server React component. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: () => React.JSX.Element;
}

import { Article as RlsArticle, meta as rlsMeta } from "./content/row-level-security-postgres-2026";
import {
  Article as SupabaseVsArticle,
  meta as supabaseVsMeta,
} from "./content/supabase-vs-self-hosted-postgres";
import {
  Article as MultiTenantArticle,
  meta as multiTenantMeta,
} from "./content/multi-tenant-saas-postgres";
import { Article as PgvectorArticle, meta as pgvectorMeta } from "./content/pgvector-rag-production";
import {
  Article as MigrationsArticle,
  meta as migrationsMeta,
} from "./content/zero-downtime-migrations";
import {
  Article as AiAdminArticle,
  meta as aiAdminMeta,
} from "./content/ai-assisted-database-admin";
import { Article as JsonbArticle, meta as jsonbMeta } from "./content/jsonb-vs-tables";
import {
  Article as PoolingArticle,
  meta as poolingMeta,
} from "./content/postgres-connection-pooling-2026";
import {
  Article as WhichDbArticle,
  meta as whichDbMeta,
} from "./content/which-database-for-vibe-coding-2026";
import {
  Article as MongoVsPgArticle,
  meta as mongoVsPgMeta,
} from "./content/mongodb-vs-postgres-2026";
import {
  Article as AiFriendlyArticle,
  meta as aiFriendlyMeta,
} from "./content/best-ai-friendly-database-2026";
import {
  Article as VectorsArticle,
  meta as vectorsMeta,
} from "./content/vector-databases-ranked-2026";
import {
  Article as SqliteEdgeArticle,
  meta as sqliteEdgeMeta,
} from "./content/sqlite-at-the-edge-2026";
import {
  Article as VibePatternsArticle,
  meta as vibePatternsMeta,
} from "./content/vibe-coding-database-patterns";
import {
  Article as SupabaseAgentsArticle,
  meta as supabaseAgentsMeta,
} from "./content/why-supabase-for-ai-agents";
import {
  Article as EdgeCompareArticle,
  meta as edgeCompareMeta,
} from "./content/edge-databases-comparison-2026";

const REGISTRY: ArticleMeta[] = [
  { ...rlsMeta, body: RlsArticle },
  { ...supabaseVsMeta, body: SupabaseVsArticle },
  { ...multiTenantMeta, body: MultiTenantArticle },
  { ...pgvectorMeta, body: PgvectorArticle },
  { ...migrationsMeta, body: MigrationsArticle },
  { ...aiAdminMeta, body: AiAdminArticle },
  { ...jsonbMeta, body: JsonbArticle },
  { ...poolingMeta, body: PoolingArticle },
  { ...whichDbMeta, body: WhichDbArticle },
  { ...mongoVsPgMeta, body: MongoVsPgArticle },
  { ...aiFriendlyMeta, body: AiFriendlyArticle },
  { ...vectorsMeta, body: VectorsArticle },
  { ...sqliteEdgeMeta, body: SqliteEdgeArticle },
  { ...vibePatternsMeta, body: VibePatternsArticle },
  { ...supabaseAgentsMeta, body: SupabaseAgentsArticle },
  { ...edgeCompareMeta, body: EdgeCompareArticle },
];

export function listArticles(): ArticleMeta[] {
  // Newest first
  return [...REGISTRY].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getArticle(slug: string): ArticleMeta | null {
  return REGISTRY.find((a) => a.slug === slug) ?? null;
}

export function listSlugs(): string[] {
  return REGISTRY.map((a) => a.slug);
}
