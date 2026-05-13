"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";
import { useSchema } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { findAnalysis, pickPreset } from "@/lib/presets/pick";

const UserDetail = dynamic(() => import("@/components/presets/UserDetail"));
const ContentDetail = dynamic(() => import("@/components/presets/ContentDetail"));
const LogDetail = dynamic(() => import("@/components/presets/LogDetail"));
const CommerceDetail = dynamic(() => import("@/components/presets/CommerceDetail"));
const TaskDetail = dynamic(() => import("@/components/presets/TaskDetail"));
const MessageDetail = dynamic(() => import("@/components/presets/MessageDetail"));
const GenericDetail = dynamic(() => import("@/components/presets/GenericDetail"));

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

  const sharedProps = {
    connectionId,
    table,
    schema: schema!,
    analysis,
    pkSegment,
  };

  if (preset === "users") return <UserDetail {...sharedProps} />;
  if (preset === "content") return <ContentDetail {...sharedProps} />;
  if (preset === "logs") return <LogDetail {...sharedProps} />;
  if (preset === "commerce") return <CommerceDetail {...sharedProps} />;
  if (preset === "tasks") return <TaskDetail {...sharedProps} />;
  if (preset === "messages") return <MessageDetail {...sharedProps} />;
  return <GenericDetail {...sharedProps} />;
}
