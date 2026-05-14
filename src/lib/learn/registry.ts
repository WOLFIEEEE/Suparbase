import type React from "react";

export interface GlossaryEntry {
  slug: string;
  term: string;
  /** SEO title; defaults to "{term} explained · Suparbase". */
  title?: string;
  /** 140-160 char description. */
  description: string;
  /** Display category for the hub. */
  category: "Postgres" | "Supabase" | "AI" | "Patterns" | "Vibe-coding";
  /** Server component with the full definition. */
  body: () => React.JSX.Element;
  /** Slugs of related articles / guides / comparisons. */
  related?: ReadonlyArray<{ kind: "blog" | "guide" | "compare"; slug: string; label: string }>;
}

import { meta as rlsMeta, Body as rlsBody } from "./content/rls";
import { meta as jsonbMeta, Body as jsonbBody } from "./content/jsonb";
import { meta as mvccMeta, Body as mvccBody } from "./content/mvcc";
import { meta as ragMeta, Body as ragBody } from "./content/rag";
import { meta as hnswMeta, Body as hnswBody } from "./content/hnsw";
import { meta as pgvectorMeta, Body as pgvectorBody } from "./content/pgvector";
import { meta as poolingMeta, Body as poolingBody } from "./content/connection-pooling";
import { meta as vibeMeta, Body as vibeBody } from "./content/vibe-coding";
import { meta as postgrestMeta, Body as postgrestBody } from "./content/postgrest";
import { meta as auditMeta, Body as auditBody } from "./content/audit-log";

const REGISTRY: GlossaryEntry[] = [
  { ...rlsMeta, body: rlsBody },
  { ...jsonbMeta, body: jsonbBody },
  { ...mvccMeta, body: mvccBody },
  { ...ragMeta, body: ragBody },
  { ...hnswMeta, body: hnswBody },
  { ...pgvectorMeta, body: pgvectorBody },
  { ...poolingMeta, body: poolingBody },
  { ...vibeMeta, body: vibeBody },
  { ...postgrestMeta, body: postgrestBody },
  { ...auditMeta, body: auditBody },
];

export function listLearn(): GlossaryEntry[] {
  return [...REGISTRY].sort((a, b) => a.term.localeCompare(b.term));
}

export function getLearn(slug: string): GlossaryEntry | null {
  return REGISTRY.find((e) => e.slug === slug) ?? null;
}
