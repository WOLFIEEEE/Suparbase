import type React from "react";

export interface CompareRow {
  feature: string;
  /** Free text or a JSX node for either side; we keep it string for simplicity. */
  left: string;
  right: string;
}

export interface CompareMeta {
  slug: string;
  leftName: string;
  rightName: string;
  title: string;
  description: string;
  /** One-paragraph TL;DR shown above the matrix. */
  tldr: string;
  /** Optional "winner for X" callouts. */
  callouts?: ReadonlyArray<{ context: string; winner: string }>;
  /** Feature matrix. */
  matrix: ReadonlyArray<CompareRow>;
  /** Body content: when-each-wins sections, conclusion, etc. */
  body: () => React.JSX.Element;
}

import { meta as sbFbMeta, Body as sbFbBody } from "./content/supabase-vs-firebase";
import { meta as pgMongoMeta, Body as pgMongoBody } from "./content/postgres-vs-mongodb";
import { meta as sbNeonMeta, Body as sbNeonBody } from "./content/supabase-vs-neon";
import { meta as sbPbMeta, Body as sbPbBody } from "./content/supabase-vs-pocketbase";
import { meta as pgMyMeta, Body as pgMyBody } from "./content/postgres-vs-mysql-2026";
import { meta as drizPrismaMeta, Body as drizPrismaBody } from "./content/drizzle-vs-prisma";
import { meta as pgvPineMeta, Body as pgvPineBody } from "./content/pgvector-vs-pinecone";
import { meta as sbAuthClerkMeta, Body as sbAuthClerkBody } from "./content/supabase-auth-vs-clerk";
import { meta as sbConvexMeta, Body as sbConvexBody } from "./content/supabase-vs-convex";

const REGISTRY: CompareMeta[] = [
  { ...sbFbMeta, body: sbFbBody },
  { ...pgMongoMeta, body: pgMongoBody },
  { ...sbNeonMeta, body: sbNeonBody },
  { ...sbPbMeta, body: sbPbBody },
  { ...pgMyMeta, body: pgMyBody },
  { ...drizPrismaMeta, body: drizPrismaBody },
  { ...pgvPineMeta, body: pgvPineBody },
  { ...sbAuthClerkMeta, body: sbAuthClerkBody },
  { ...sbConvexMeta, body: sbConvexBody },
];

export function listCompare(): CompareMeta[] {
  return REGISTRY;
}

export function getCompare(slug: string): CompareMeta | null {
  return REGISTRY.find((c) => c.slug === slug) ?? null;
}
