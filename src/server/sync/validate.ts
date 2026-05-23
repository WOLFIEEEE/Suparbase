import "server-only";
import { z } from "zod";
import { DEFAULT_SYNC_OPTIONS, DEFAULT_SYNC_TABLE_CONFIG } from "@/server/schema/sync";

export const fkResolutionSchema = z.object({
  strategy: z.enum(["null", "remap"]),
  remapTo: z.string().max(255).optional(),
});

export const anonRuleSchema = z.object({
  strategy: z.enum(["null", "fixed", "hash", "email"]),
  value: z.string().max(255).optional(),
});

export const tableRuleSchema = z.object({
  action: z.enum(["sync", "exclude", "skip"]),
  fk: z.record(fkResolutionSchema).optional(),
  anonymize: z.record(anonRuleSchema).optional(),
});

export const tableConfigSchema = z
  .object({ tables: z.record(tableRuleSchema) })
  .default(DEFAULT_SYNC_TABLE_CONFIG);

export const optionsSchema = z
  .object({
    applySchema: z.boolean(),
    allowDestructive: z.boolean(),
    rowCap: z.number().int().nonnegative().max(10_000_000).nullable(),
  })
  .default(DEFAULT_SYNC_OPTIONS);

const scheduleSchema = z.number().int().min(1).max(8760).nullable();

export const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseConnectionId: z.string().uuid(),
  options: optionsSchema,
  tableConfig: tableConfigSchema,
  scheduleIntervalHours: scheduleSchema.optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  baseConnectionId: z.string().uuid().optional(),
  options: optionsSchema.optional(),
  tableConfig: tableConfigSchema.optional(),
  scheduleIntervalHours: scheduleSchema.optional(),
});

/** Body for the dry-run plan preview: either a saved profile or inline config. */
export const planRequestSchema = z.union([
  z.object({ profileId: z.string().uuid() }),
  z.object({
    baseConnectionId: z.string().uuid(),
    options: optionsSchema,
    tableConfig: tableConfigSchema,
  }),
]);

export const startRunSchema = z.object({
  profileId: z.string().uuid(),
  dryRun: z.boolean().default(false),
  /** Must equal the target connection name for a real (non-dry) run. */
  confirm: z.string().optional(),
});
