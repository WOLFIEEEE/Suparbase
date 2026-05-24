"use client";
import type {
  SyncOptions,
  SyncProfileRow,
  SyncRunRow,
  SyncTableConfig,
} from "@/server/schema/sync";
import type { SyncPlan } from "@/server/sync/plan";
import type { AdvisorResponse, PrivacyTier } from "@/server/sync/advisor-schema";

export type { SyncOptions, SyncProfileRow, SyncRunRow, SyncTableConfig, SyncPlan };
export type { AdvisorResponse, PrivacyTier };

// JSON shapes (Dates serialize to strings over the wire).
export type ProfileJson = Omit<SyncProfileRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
export type RunJson = Omit<SyncRunRow, "startedAt" | "finishedAt"> & {
  startedAt: string;
  finishedAt: string | null;
};

export interface ConnSummary {
  id: string;
  name: string;
  hostname: string;
  hasPostgresUrl: boolean;
}

async function asError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  throw new Error(body.message ?? `Request failed (${res.status}).`);
}

export async function listConnections(): Promise<ConnSummary[]> {
  const res = await fetch("/api/connections");
  if (!res.ok) await asError(res);
  return res.json();
}

export async function listProfiles(
  connId: string,
): Promise<{ profiles: ProfileJson[]; targetHasPostgresUrl: boolean; myRole: string }> {
  const res = await fetch(`/api/connections/${connId}/sync/profiles`);
  if (!res.ok) await asError(res);
  return res.json();
}

export async function createProfile(
  connId: string,
  body: { name: string; baseConnectionId: string; options: SyncOptions; tableConfig: SyncTableConfig },
): Promise<ProfileJson> {
  const res = await fetch(`/api/connections/${connId}/sync/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).profile;
}

export async function updateProfile(
  connId: string,
  pid: string,
  body: Partial<{
    name: string;
    baseConnectionId: string;
    options: SyncOptions;
    tableConfig: SyncTableConfig;
    scheduleIntervalHours: number | null;
  }>,
): Promise<ProfileJson> {
  const res = await fetch(`/api/connections/${connId}/sync/profiles/${pid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).profile;
}

export async function deleteProfile(connId: string, pid: string): Promise<void> {
  const res = await fetch(`/api/connections/${connId}/sync/profiles/${pid}`, { method: "DELETE" });
  if (!res.ok) await asError(res);
}

export async function previewPlan(
  connId: string,
  body:
    | { profileId: string }
    | { baseConnectionId: string; options: SyncOptions; tableConfig: SyncTableConfig },
): Promise<{ plan: SyncPlan; warnings: string[] }> {
  const res = await fetch(`/api/connections/${connId}/sync/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res);
  return res.json();
}

export async function analyze(
  connId: string,
  body: { profileId?: string; baseConnectionId?: string; tier: PrivacyTier },
): Promise<{ suggestions: AdvisorResponse; model: string }> {
  const res = await fetch(`/api/connections/${connId}/sync/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await asError(res);
  return res.json();
}

export async function abortRun(connId: string, runId: string): Promise<void> {
  const res = await fetch(`/api/connections/${connId}/sync/runs/${runId}/abort`, {
    method: "POST",
  });
  if (!res.ok) await asError(res);
}

export async function listRuns(connId: string): Promise<{ runs: RunJson[] }> {
  const res = await fetch(`/api/connections/${connId}/sync/runs`);
  if (!res.ok) await asError(res);
  return res.json();
}

export interface SyncEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Start a run and stream its SSE progress. Resolves when the stream closes.
 * Throws synchronously (before any event) on a non-2xx response.
 */
export async function streamRun(
  connId: string,
  body: { profileId: string; dryRun: boolean; confirm?: string },
  onEvent: (e: SyncEvent) => void,
): Promise<void> {
  const res = await fetch(`/api/connections/${connId}/sync/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) await asError(res);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseSse(chunk);
      if (parsed) onEvent(parsed);
    }
  }
}

function parseSse(chunk: string): SyncEvent | null {
  let event = "message";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return null;
  }
}
