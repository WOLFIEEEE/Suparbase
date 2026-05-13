"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";
import { TableRowView } from "@/components/workspace/TableRowView";
import { useSchema } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { findAnalysis, pickPreset } from "@/lib/presets/pick";

const UserDetail = dynamic(() => import("@/components/presets/UserDetail"));
const ContentDetail = dynamic(() => import("@/components/presets/ContentDetail"));
const LogDetail = dynamic(() => import("@/components/presets/LogDetail"));

interface Props {
  tableName: string;
  pkSegment: string;
}

export function RowPresetRouter({ tableName, pkSegment }: Props) {
  const connectionId = useCurrentConnectionId();
  const params = useSearchParams();
  const override = params.get("view") === "generic";

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
  const preset = pickPreset(table, analysis, override ? "generic" : null);

  if (preset === "users") {
    return (
      <UserDetail
        connectionId={connectionId}
        table={table}
        schema={schema!}
        analysis={analysis}
        pkSegment={pkSegment}
      />
    );
  }
  if (preset === "content") {
    return (
      <ContentDetail
        connectionId={connectionId}
        table={table}
        schema={schema!}
        analysis={analysis}
        pkSegment={pkSegment}
      />
    );
  }
  if (preset === "logs") {
    return (
      <LogDetail
        connectionId={connectionId}
        table={table}
        schema={schema!}
        analysis={analysis}
        pkSegment={pkSegment}
      />
    );
  }

  return <TableRowView tableName={tableName} pkSegment={pkSegment} />;
}
