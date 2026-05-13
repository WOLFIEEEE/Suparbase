"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppError } from "@/lib/errors";
import type { SchemaAnalysisResult } from "@/lib/types/analysis";

type LoadResult = SchemaAnalysisResult | { state: "not_cached" };

async function fetchCachedAnalysis(connectionId: string): Promise<LoadResult> {
  const res = await fetch(`/api/ai/analyze/${connectionId}`);
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed.");
  }
  return res.json();
}

async function runFreshAnalysis(connectionId: string, force = false): Promise<SchemaAnalysisResult> {
  const res = await fetch(`/api/ai/analyze/${connectionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Analysis failed.");
  }
  return res.json();
}

export function useAnalysis(connectionId: string | undefined) {
  return useQuery<LoadResult>({
    queryKey: ["analysis", connectionId],
    queryFn: () => fetchCachedAnalysis(connectionId!),
    enabled: !!connectionId,
    staleTime: 60_000,
  });
}

export function useRunAnalysis(connectionId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => {
      if (!connectionId) throw new Error("No connection");
      return runFreshAnalysis(connectionId, force);
    },
    onSuccess: (result) => {
      qc.setQueryData(["analysis", connectionId], result);
      qc.invalidateQueries({ queryKey: ["settings", "ai"] });
    },
  });
}

export function analysisOrNull(result: LoadResult | undefined): SchemaAnalysisResult | null {
  if (!result) return null;
  if ("state" in result && result.state === "not_cached") return null;
  return result as SchemaAnalysisResult;
}
