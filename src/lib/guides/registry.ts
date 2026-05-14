import type React from "react";

export interface GuideStep {
  title: string;
  id: string;
}

export interface GuideMeta {
  slug: string;
  title: string;
  description: string;
  /** Visible difficulty tag. */
  level: "Beginner" | "Intermediate" | "Advanced";
  /** Estimated reading time, in minutes. */
  readingMinutes: number;
  /** Time-to-complete the steps. */
  timeMinutes: number;
  tags: ReadonlyArray<string>;
  steps: ReadonlyArray<GuideStep>;
  body: () => React.JSX.Element;
}

import { meta as cursorMeta, Body as cursorBody } from "./content/setup-supabase-with-cursor";
import { meta as rlsMeta, Body as rlsBody } from "./content/add-rls-to-existing-database";
import { meta as ragMeta, Body as ragBody } from "./content/first-rag-app-with-pgvector";
import { meta as mtMeta, Body as mtBody } from "./content/multi-tenant-supabase-in-a-day";

const REGISTRY: GuideMeta[] = [
  { ...cursorMeta, body: cursorBody },
  { ...rlsMeta, body: rlsBody },
  { ...ragMeta, body: ragBody },
  { ...mtMeta, body: mtBody },
];

export function listGuides(): GuideMeta[] {
  return REGISTRY;
}

export function getGuide(slug: string): GuideMeta | null {
  return REGISTRY.find((g) => g.slug === slug) ?? null;
}
