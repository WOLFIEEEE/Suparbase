import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { schemaAnalysis } from "@/server/schema/schema-analysis";
import { getConnectionForUser } from "@/server/connections/repo";
import { introspectConnection } from "@/server/schema-introspect";
import { fingerprintSchema } from "./fingerprint";
import { runAnalysis, OpenRouterError } from "./openrouter";
import { buildUserPrompt, getSystemPrompt } from "./prompt";
import { getUserSettings, readOpenrouterKey, recordLastAnalysis } from "@/server/settings/repo";
import { heuristicAnalysisFor } from "@/lib/presets/heuristic";
import type { SchemaAnalysisResult, TableAnalysis } from "@/lib/types/analysis";

export type LoadResult = SchemaAnalysisResult | { state: "not_cached" };

/**
 * Read-only: return the cached analysis for the current schema fingerprint,
 * or { state: "not_cached" }.
 */
export async function loadCachedAnalysis(
  userId: string,
  connectionId: string,
): Promise<LoadResult> {
  const conn = await getConnectionForUser(userId, connectionId);
  if (!conn) return { state: "not_cached" };
  const schema = await introspectConnection(conn);
  const fp = fingerprintSchema(schema);
  const rows = await db
    .select()
    .from(schemaAnalysis)
    .where(
      and(
        eq(schemaAnalysis.userId, userId),
        eq(schemaAnalysis.connectionId, connectionId),
        eq(schemaAnalysis.schemaFingerprint, fp),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { state: "not_cached" };
  return rowToResult(row, fp);
}

/**
 * Run a fresh analysis if not already cached for the current schema
 * fingerprint, or if `force` is true. Falls back to a heuristic when no
 * OpenRouter key is set or the LLM call fails.
 */
export async function runOrLoadAnalysis(
  userId: string,
  connectionId: string,
  options: { force?: boolean } = {},
): Promise<SchemaAnalysisResult> {
  const conn = await getConnectionForUser(userId, connectionId);
  if (!conn) throw new Error("Connection not found");

  const schema = await introspectConnection(conn);
  const fp = fingerprintSchema(schema);

  if (!options.force) {
    const existing = await loadFromCache(userId, connectionId, fp);
    if (existing) return existing;
  }

  // Try AI; if it fails or no key, use heuristic.
  const settings = await getUserSettings(userId);
  const apiKey = readOpenrouterKey(settings);
  const model = settings?.defaultModel ?? "anthropic/claude-3.5-haiku";

  if (apiKey) {
    try {
      const llm = await runAnalysis({
        apiKey,
        model,
        systemPrompt: getSystemPrompt(),
        userPrompt: buildUserPrompt(schema),
      });
      // Filter out tables the model hallucinated that aren't actually in the schema.
      const realNames = new Set(schema.tables.map((t) => `${t.schema}.${t.name}`));
      const aiTables: TableAnalysis[] = llm.analysis.tables
        .filter((t) => realNames.has(`${t.schema}.${t.name}`))
        .map(normalizeAi);
      // For any real table the model omitted, add a heuristic entry.
      for (const t of schema.tables) {
        if (!aiTables.find((x) => x.schema === t.schema && x.name === t.name)) {
          aiTables.push(heuristicAnalysisFor(t));
        }
      }
      const result = await persist({
        userId,
        connectionId,
        fp,
        tables: aiTables,
        model: llm.model,
        source: "ai",
        usage: llm.usage,
      });
      await recordLastAnalysis(
        userId,
        llm.model,
        llm.usage.promptTokens,
        llm.usage.completionTokens,
        llm.usage.totalTokens,
      );
      return result;
    } catch (err) {
      // Surface unauthorized to the API layer so the user can fix their key,
      // but fall through for everything else.
      if (err instanceof OpenRouterError && err.category === "unauthorized") {
        throw err;
      }
      // fall through to heuristic
    }
  }

  // Heuristic path.
  const heuristicTables = schema.tables.map(heuristicAnalysisFor);
  return persist({
    userId,
    connectionId,
    fp,
    tables: heuristicTables,
    model: "heuristic",
    source: "heuristic",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  });
}

function normalizeAi(raw: TableAnalysis): TableAnalysis {
  return {
    schema: raw.schema,
    name: raw.name,
    category: raw.category,
    displayName: raw.displayName,
    listColumns: raw.listColumns.slice(0, 6),
    statusColumn: raw.statusColumn ?? null,
    titleColumn: raw.titleColumn ?? null,
    notes: raw.notes,
  };
}

async function loadFromCache(
  userId: string,
  connectionId: string,
  fp: string,
): Promise<SchemaAnalysisResult | null> {
  const rows = await db
    .select()
    .from(schemaAnalysis)
    .where(
      and(
        eq(schemaAnalysis.userId, userId),
        eq(schemaAnalysis.connectionId, connectionId),
        eq(schemaAnalysis.schemaFingerprint, fp),
      ),
    )
    .limit(1);
  return rows[0] ? rowToResult(rows[0], fp) : null;
}

interface PersistInput {
  userId: string;
  connectionId: string;
  fp: string;
  tables: TableAnalysis[];
  model: string;
  source: "ai" | "heuristic";
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

async function persist(input: PersistInput): Promise<SchemaAnalysisResult> {
  const [row] = await db
    .insert(schemaAnalysis)
    .values({
      userId: input.userId,
      connectionId: input.connectionId,
      schemaFingerprint: input.fp,
      analysis: input.tables,
      model: input.model,
      source: input.source,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
    })
    .onConflictDoUpdate({
      target: [
        schemaAnalysis.userId,
        schemaAnalysis.connectionId,
        schemaAnalysis.schemaFingerprint,
      ],
      set: {
        analysis: input.tables,
        model: input.model,
        source: input.source,
        promptTokens: input.usage.promptTokens,
        completionTokens: input.usage.completionTokens,
        totalTokens: input.usage.totalTokens,
        createdAt: new Date(),
      },
    })
    .returning();
  return rowToResult(row!, input.fp);
}

function rowToResult(
  row: {
    analysis: TableAnalysis[];
    model: string;
    source: "ai" | "heuristic";
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    createdAt: Date;
  },
  fp: string,
): SchemaAnalysisResult {
  return {
    fingerprint: fp,
    source: row.source,
    model: row.model,
    tables: row.analysis,
    usage: {
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
    },
    finishedAt: row.createdAt.toISOString(),
  };
}
