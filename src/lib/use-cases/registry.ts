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
import { meta as indieMeta, Page as IndiePage } from "./content/indie-hackers";
import { meta as aiMeta, Page as AiPage } from "./content/ai-startups";
import { meta as hcMeta, Page as HcPage } from "./content/healthcare-saas";
import { meta as ecomMeta, Page as EcomPage } from "./content/ecommerce-operators";
import { meta as vibeMeta, Page as VibePage } from "./content/vibe-coders";

const REGISTRY: UseCaseMeta[] = [
  { ...vibeMeta, body: VibePage },
  { ...saasMeta, body: SaasPage },
  { ...agencyMeta, body: AgencyPage },
  { ...internalMeta, body: InternalPage },
  { ...indieMeta, body: IndiePage },
  { ...aiMeta, body: AiPage },
  { ...hcMeta, body: HcPage },
  { ...ecomMeta, body: EcomPage },
];

export function listUseCases(): UseCaseMeta[] {
  return REGISTRY;
}

export function getUseCase(slug: string): UseCaseMeta | null {
  return REGISTRY.find((u) => u.slug === slug) ?? null;
}
