import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { userSettings, type UserSettingsRow } from "@/server/schema/user-settings";
import { encryptKey, decryptKey } from "@/server/crypto/vault";
import type { AiSettingsSummary } from "@/lib/types/analysis";

const DEFAULT_MODEL = process.env.SUPARBASE_AI_DEFAULT_MODEL ?? "anthropic/claude-3.5-haiku";

export function toSummary(row: UserSettingsRow | null, fallbackModel = DEFAULT_MODEL): AiSettingsSummary {
  if (!row) {
    return {
      hasKey: false,
      defaultModel: fallbackModel,
      lastAnalysisModel: null,
      lastAnalysisAt: null,
      lastPromptTokens: null,
      lastCompletionTokens: null,
      lastTotalTokens: null,
    };
  }
  return {
    hasKey: !!row.encryptedOpenrouterKey,
    defaultModel: row.defaultModel,
    lastAnalysisModel: row.lastAnalysisModel,
    lastAnalysisAt: row.lastAnalysisAt ? row.lastAnalysisAt.toISOString() : null,
    lastPromptTokens: row.lastPromptTokens,
    lastCompletionTokens: row.lastCompletionTokens,
    lastTotalTokens: row.lastTotalTokens,
  };
}

export async function getUserSettings(userId: string): Promise<UserSettingsRow | null> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return rows[0] ?? null;
}

async function upsertUserSettings(
  userId: string,
  patch: Partial<Omit<UserSettingsRow, "userId" | "updatedAt">>,
): Promise<UserSettingsRow> {
  // Ensure a row exists, then update.
  await db
    .insert(userSettings)
    .values({ userId, defaultModel: patch.defaultModel ?? DEFAULT_MODEL, ...patch })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...patch, updatedAt: new Date() },
    });
  const row = await getUserSettings(userId);
  if (!row) throw new Error("Failed to upsert user_settings");
  return row;
}

export async function setOpenrouterKey(userId: string, plaintext: string): Promise<UserSettingsRow> {
  const encryptedOpenrouterKey = encryptKey(plaintext);
  return upsertUserSettings(userId, { encryptedOpenrouterKey });
}

export async function clearOpenrouterKey(userId: string): Promise<UserSettingsRow> {
  return upsertUserSettings(userId, { encryptedOpenrouterKey: null });
}

export async function setDefaultModel(userId: string, defaultModel: string): Promise<UserSettingsRow> {
  return upsertUserSettings(userId, { defaultModel });
}

export async function recordLastAnalysis(
  userId: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
): Promise<void> {
  await upsertUserSettings(userId, {
    lastAnalysisModel: model,
    lastAnalysisAt: new Date(),
    lastPromptTokens: promptTokens,
    lastCompletionTokens: completionTokens,
    lastTotalTokens: totalTokens,
  });
}

export function readOpenrouterKey(row: UserSettingsRow | null): string | null {
  if (!row?.encryptedOpenrouterKey) return null;
  return decryptKey(row.encryptedOpenrouterKey);
}
