import type React from "react";

export interface UseCaseMeta {
  slug: string;
  title: string;
  description: string;
  audience: string;
  /** Short list shown on the hub. */
  bullets: ReadonlyArray<string>;
  /** Detail page body (server component). */
  body: () => React.JSX.Element;
}

import { meta as saasMeta, Page as SaasPage } from "./content/saas-admin";
import { meta as agencyMeta, Page as AgencyPage } from "./content/agency-multi-client";
import { meta as internalMeta, Page as InternalPage } from "./content/internal-tools";

const REGISTRY: UseCaseMeta[] = [
  { ...saasMeta, body: SaasPage },
  { ...agencyMeta, body: AgencyPage },
  { ...internalMeta, body: InternalPage },
];

export function listUseCases(): UseCaseMeta[] {
  return REGISTRY;
}

export function getUseCase(slug: string): UseCaseMeta | null {
  return REGISTRY.find((u) => u.slug === slug) ?? null;
}
