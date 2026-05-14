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

const REGISTRY: ArticleMeta[] = [
  { ...rlsMeta, body: RlsArticle },
  { ...supabaseVsMeta, body: SupabaseVsArticle },
  { ...multiTenantMeta, body: MultiTenantArticle },
  { ...pgvectorMeta, body: PgvectorArticle },
  { ...migrationsMeta, body: MigrationsArticle },
  { ...aiAdminMeta, body: AiAdminArticle },
  { ...jsonbMeta, body: JsonbArticle },
  { ...poolingMeta, body: PoolingArticle },
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
