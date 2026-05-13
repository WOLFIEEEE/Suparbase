"use client";
import Link from "next/link";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TableAnalysis } from "@/lib/types/analysis";

interface Props {
  connectionId: string;
  tableName: string;
  displayName: string;
  analysis: TableAnalysis | undefined;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PresetHeader({ connectionId, tableName, displayName, analysis, subtitle, actions }: Props) {
  return (
    <div className="space-y-2">
      <Link
        href={`/c/${connectionId}/tables`}
        className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> all tables
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-display-md">{displayName}</h1>
            {analysis && (
              <Badge tone="accent">
                <Sparkles className="h-3 w-3" aria-hidden />
                {analysis.category}
              </Badge>
            )}
          </div>
          <p className="font-mono text-xs text-fg-muted">{tableName}{subtitle ? ` · ${subtitle}` : ""}</p>
        </div>
        {actions}
      </div>
    </div>
  );
}
