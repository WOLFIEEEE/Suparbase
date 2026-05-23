import "server-only";
import { runJsonCompletion } from "@/server/ai/openrouter";
import type { DbCatalog, PgHandle, TableMeta } from "./catalog";
import { NEVER_SYNC_SCHEMAS } from "./catalog";
import { tableIdent } from "./sql-util";
import { advisorResponseSchema, type AdvisorResponse, type PrivacyTier } from "./advisor-schema";

/**
 * AI advisor for sync: reads the base schema (and, at higher privacy tiers,
 * redacted or raw samples) and proposes table classifications, FK resolutions
 * for PII/excluded references, and *inferred* relationships the catalog
 * doesn't declare. Advisory only — output maps onto `table_config` after the
 * user reviews it; it never produces or runs SQL.
 *
 * Privacy tiers (redaction happens here, before the prompt is built):
 *   schema   — names/types/declared FKs only. No row data leaves the server.
 *   redacted — adds per-column value *shapes* (email/uuid/int/…) from a small
 *              sample. Still no raw values.
 *   raw      — adds a few real sample rows. Gated; for the user's own data.
 */

const MAX_TABLES = 80;
const MAX_COLS = 40;
const SAMPLE_ROWS = 8;

export interface AdvisorResult {
  suggestions: AdvisorResponse;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export async function runAdvisor(params: {
  baseSql: PgHandle;
  baseCatalog: DbCatalog;
  targetCatalog: DbCatalog;
  apiKey: string;
  model: string;
  tier: PrivacyTier;
}): Promise<AdvisorResult> {
  const { baseSql, baseCatalog, targetCatalog, apiKey, model, tier } = params;

  const tables = baseCatalog.tables.slice(0, MAX_TABLES);
  const samples =
    tier === "schema" ? {} : await collectSamples(baseSql, tables, tier);

  const payload = {
    tables: tables.map((t) => describeTable(t, samples[t.qualified])),
    enums: baseCatalog.enums.map((e) => ({ name: `${e.schema}.${e.name}`, values: e.values.slice(0, 30) })),
    targetTables: targetCatalog.tables.map((t) => t.qualified),
    neverSyncSchemas: NEVER_SYNC_SCHEMAS,
  };

  const result = await runJsonCompletion({
    apiKey,
    model,
    maxTokens: 3000,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: JSON.stringify(payload),
  });

  const parsed = advisorResponseSchema.safeParse(result.content);
  if (!parsed.success) {
    throw new Error(`AI advisor returned malformed output: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  return { suggestions: parsed.data, model: result.model, usage: result.usage };
}

const SYSTEM_PROMPT = `You advise a database sync that copies a "base" (prod) into a "target" (staging) by full-replace per table. Your job is JUDGMENT the catalog can't give. You never write SQL.

Given the base schema (and possibly redacted samples), return STRICT JSON:
{
  "inferredRelationships": [{ "childTable": "schema.table", "childColumns": ["col"], "refTable": "schema.table", "refColumns": ["col"], "confidence": 0..1, "rationale": "..." }],
  "tableClassifications": [{ "table": "schema.table", "kind": "user_pii|seed_config|transactional|lookup|other", "suggestedAction": "sync|exclude|skip", "rationale": "..." }],
  "fkResolutionSuggestions": [{ "table": "schema.table", "column": "col", "strategy": "null|remap", "remapTo": "optional value", "rationale": "..." }],
  "notes": ["..."]
}

Guidance:
- Infer relationships that AREN'T declared as foreign keys (common in Supabase apps): e.g. a "user_id"/"owner_id" uuid column almost certainly references the users/profiles table even with no constraint. Report these in inferredRelationships.
- Classify tables that hold personal/user data as "user_pii" and suggest "exclude" so staging keeps its own users. Seed/lookup/config tables → usually "sync". Large append-only logs → consider "skip".
- For any synced table whose column references an excluded/user table (declared or inferred), add a fkResolutionSuggestion: "null" if the column is nullable, otherwise "remap" (and leave remapTo empty for the user to fill, or suggest a placeholder).
- Use exact "schema.table" identifiers from the input. Only reference tables/columns that exist in the input. Be concise in rationale.
Respond with ONLY the JSON object.`;

interface ColumnDesc {
  name: string;
  type: string;
  nullable: boolean;
  pk?: boolean;
  fk?: string;
  shapes?: string[];
  sample?: unknown[];
}

function describeTable(t: TableMeta, sample?: SampleRows) {
  const pk = new Set(t.primaryKey);
  const fkByCol = new Map<string, string>();
  for (const fk of t.foreignKeys) {
    fk.columns.forEach((c, i) => {
      fkByCol.set(c, `${fk.refSchema}.${fk.refTable}.${fk.refColumns[i] ?? fk.refColumns[0] ?? ""}`);
    });
  }
  const columns: ColumnDesc[] = t.columns.slice(0, MAX_COLS).map((c) => {
    const d: ColumnDesc = { name: c.name, type: c.dataType, nullable: !c.notNull };
    if (pk.has(c.name)) d.pk = true;
    const fk = fkByCol.get(c.name);
    if (fk) d.fk = fk;
    if (sample?.shapes?.[c.name]) d.shapes = sample.shapes[c.name];
    if (sample?.values?.[c.name]) d.sample = sample.values[c.name];
    return d;
  });
  return { table: t.qualified, estimatedRows: t.estimatedRows, columns };
}

interface SampleRows {
  shapes?: Record<string, string[]>;
  values?: Record<string, unknown[]>;
}

async function collectSamples(
  baseSql: PgHandle,
  tables: TableMeta[],
  tier: PrivacyTier,
): Promise<Record<string, SampleRows>> {
  const sql = baseSql as import("postgres").Sql<Record<string, never>>;
  const out: Record<string, SampleRows> = {};
  for (const t of tables) {
    try {
      const rows = await sql.unsafe(
        `SELECT * FROM ${tableIdent(t.schema, t.name)} LIMIT ${SAMPLE_ROWS}`,
      );
      const shapes: Record<string, Set<string>> = {};
      const values: Record<string, unknown[]> = {};
      for (const row of rows as unknown as Record<string, unknown>[]) {
        for (const [k, v] of Object.entries(row)) {
          (shapes[k] ??= new Set()).add(valueShape(v));
          if (tier === "raw") (values[k] ??= []).push(truncateRaw(v));
        }
      }
      const shapeOut: Record<string, string[]> = {};
      for (const [k, set] of Object.entries(shapes)) shapeOut[k] = [...set].slice(0, 6);
      out[t.qualified] = { shapes: shapeOut, values: tier === "raw" ? values : undefined };
    } catch {
      // sampling is best-effort; skip tables we can't read
    }
  }
  return out;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function valueShape(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (v instanceof Date) return "timestamp";
  if (typeof v === "object") return "json";
  if (typeof v === "string") {
    if (UUID_RE.test(v)) return "uuid";
    if (EMAIL_RE.test(v)) return "email";
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "timestamp";
    return v.length > 20 ? "text(>20)" : "text(<=20)";
  }
  return "other";
}

function truncateRaw(v: unknown): unknown {
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object") return "<json>";
  return v;
}
