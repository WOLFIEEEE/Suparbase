import "server-only";
import { z } from "zod";

const CategoryEnum = z.enum(["users", "content", "logs", "generic"]);

export const TableAnalysisSchema = z.object({
  schema: z.string().min(1),
  name: z.string().min(1),
  category: CategoryEnum,
  displayName: z.string().min(1).max(80),
  listColumns: z.array(z.string()).max(8).default([]),
  statusColumn: z.string().nullable().optional(),
  titleColumn: z.string().nullable().optional(),
  notes: z.string().max(200).optional(),
});

export const AnalysisResponseSchema = z.object({
  tables: z.array(TableAnalysisSchema).min(0),
});

export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;
