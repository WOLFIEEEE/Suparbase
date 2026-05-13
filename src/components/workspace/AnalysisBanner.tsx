"use client";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAnalysis, useRunAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { AppError } from "@/lib/errors";
import type { AiSettingsSummary } from "@/lib/types/analysis";

async function fetchAiSettings(): Promise<AiSettingsSummary> {
  const res = await fetch("/api/settings/ai");
  if (!res.ok) {
    throw new AppError("server", "Failed to load AI settings.");
  }
  return res.json();
}

export function AnalysisBanner() {
  const connectionId = useCurrentConnectionId();
  const { data: settings } = useQuery({
    queryKey: ["settings", "ai"],
    queryFn: fetchAiSettings,
    staleTime: 60_000,
  });
  const { data: cached } = useAnalysis(connectionId);
  const run = useRunAnalysis(connectionId);

  const result = analysisOrNull(cached);
  const hasKey = !!settings?.hasKey;

  if (result && result.source === "ai") {
    // Subtle existing badge — no banner needed.
    return null;
  }

  if (!hasKey) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded border hairline bg-bg-raised p-4 text-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-fg-muted">
          Add an OpenRouter key to let AI classify your tables and route them to purpose-built admin presets.
        </p>
        <Button asChild variant="secondary" size="sm" className="ml-auto">
          <Link href="/settings/ai">Add key</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border hairline bg-bg-raised p-4 text-sm">
      <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p className="text-fg-muted">
        {result?.source === "heuristic"
          ? "Currently using heuristic classification. Run AI analysis for sharper labels and previews."
          : "Run AI analysis to classify your tables and pick the best admin preset per table."}
      </p>
      <Button
        variant="primary"
        size="sm"
        className="ml-auto"
        onClick={() => {
          run.mutate(true, {
            onSuccess: () => toast.success("Schema analyzed."),
            onError: (e) => toast.error(`Analysis failed: ${(e as Error).message}`),
          });
        }}
        disabled={run.isPending}
      >
        {run.isPending ? "Analyzing…" : "Run AI analysis"}
      </Button>
    </div>
  );
}
