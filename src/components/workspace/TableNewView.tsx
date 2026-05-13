"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { findAnalysis } from "@/lib/presets/pick";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/workspace/EmptyState";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RowForm } from "@/components/row/RowForm";

export function TableNewView({ tableName }: { tableName: string }) {
  const connectionId = useCurrentConnectionId();
  const router = useRouter();
  const { data: schema, isLoading } = useSchema(connectionId);
  const { data: cachedAnalysis } = useAnalysis(connectionId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
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

  if (table.kind === "view") {
    return (
      <EmptyState
        title="This is a view"
        description="Views are read-only — you cannot insert rows here."
        action={
          <Button asChild>
            <Link href={`/c/${connectionId}/tables/${encodeURIComponent(table.name)}`}>Open view</Link>
          </Button>
        }
      />
    );
  }

  const analysis = findAnalysis(analysisOrNull(cachedAnalysis)?.tables, table);
  const displayName = analysis?.displayName ?? table.name;
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Tables", href: `/c/${connectionId}/tables` },
          { label: displayName, href: tableHref },
          { label: "New" },
        ]}
        title={`New ${analysis?.category === "users" ? "user" : analysis?.category === "content" ? "post" : "row"}`}
        subtitle={<span className="font-mono text-xs">{table.schema}.{table.name}</span>}
        eyebrow={
          analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI · {analysis.category}
            </>
          ) : null
        }
      />
      <div className="surface rounded-md p-6">
        <RowForm
          table={table}
          schema={schema!}
          mode="create"
          onCancel={() => router.push(tableHref)}
        />
      </div>
    </div>
  );
}
