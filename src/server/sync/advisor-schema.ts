import { z } from "zod";

/**
 * Structured output contract for the sync AI advisor. The model returns
 * *suggestions only* — these map onto `table_config` (actions + FK
 * resolutions) which the user reviews. Nothing here is executable SQL.
 */

export const inferredRelationshipSchema = z.object({
  childTable: z.string().min(1),
  childColumns: z.array(z.string()).min(1).max(8),
  refTable: z.string().min(1),
  refColumns: z.array(z.string()).min(1).max(8),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(300).optional(),
});

export const tableClassificationSchema = z.object({
  table: z.string().min(1),
  kind: z.enum(["user_pii", "seed_config", "transactional", "lookup", "other"]),
  suggestedAction: z.enum(["sync", "exclude", "skip"]),
  rationale: z.string().max(300).optional(),
});

export const fkResolutionSuggestionSchema = z.object({
  table: z.string().min(1),
  column: z.string().min(1),
  strategy: z.enum(["null", "remap"]),
  remapTo: z.string().max(255).optional(),
  rationale: z.string().max(300).optional(),
});

export const advisorResponseSchema = z.object({
  inferredRelationships: z.array(inferredRelationshipSchema).max(100).default([]),
  tableClassifications: z.array(tableClassificationSchema).max(200).default([]),
  fkResolutionSuggestions: z.array(fkResolutionSuggestionSchema).max(200).default([]),
  notes: z.array(z.string().max(300)).max(20).default([]),
});

export type AdvisorResponse = z.infer<typeof advisorResponseSchema>;
export type InferredRelationship = z.infer<typeof inferredRelationshipSchema>;
export type TableClassification = z.infer<typeof tableClassificationSchema>;
export type FkResolutionSuggestion = z.infer<typeof fkResolutionSuggestionSchema>;

export type PrivacyTier = "schema" | "redacted" | "raw";
