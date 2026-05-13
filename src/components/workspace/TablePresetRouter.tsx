"use client";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useSchema } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { findAnalysis, pickPreset, type PresetId } from "@/lib/presets/pick";
import { EmptyState } from "@/components/workspace/EmptyState";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const UsersAdmin = dynamic(() => import("@/components/presets/UsersAdmin"));
const ContentAdmin = dynamic(() => import("@/components/presets/ContentAdmin"));
const LogsAdmin = dynamic(() => import("@/components/presets/LogsAdmin"));
const GenericAdmin = dynamic(() => import("@/components/presets/GenericAdmin"));

const MAP: Record<PresetId, typeof GenericAdmin> = {
  users: UsersAdmin,
  content: ContentAdmin,
  logs: LogsAdmin,
  generic: GenericAdmin,
};

export function TablePresetRouter({ tableName }: { tableName: string }) {
  const connectionId = useCurrentConnectionId();
  const params = useSearchParams();
  const override = params.get("view") === "generic" ? "generic" : null;

  const { data: schema, isLoading } = useSchema(connectionId);
  const { data: cachedAnalysis } = useAnalysis(connectionId);

  if (isLoading) return null;
  const table = schema?.tables.find((t) => t.name === tableName);
  if (!table) {
    return (
      <EmptyState
        title="Table not found"
        description={`No table named "${tableName}".`}
        action={
          <Button asChild variant="secondary">
            <Link href={`/c/${connectionId}/tables`}>All tables</Link>
          </Button>
        }
      />
    );
  }

  const analysis = findAnalysis(analysisOrNull(cachedAnalysis)?.tables, table);
  const preset = pickPreset(table, analysis, override as PresetId | null);
  const Component = MAP[preset];
  return <Component connectionId={connectionId} table={table} schema={schema!} analysis={analysis} />;
}
