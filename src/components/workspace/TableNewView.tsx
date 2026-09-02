"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CopyPlus, Sparkles } from "lucide-react";
import { useRow, useSchema } from "@/lib/api/hooks";
import { decodePkSegment } from "@/lib/table/pk";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { findAnalysis } from "@/lib/presets/pick";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/workspace/EmptyState";
import { PageHeader } from "@/components/workspace/PageHeader";
import { RowForm } from "@/components/row/RowForm";

export function TableNewView({ tableName }: { tableName: string }) {
  const connection = useCurrentConnection();
  const connectionId = connection.id;
  const router = useRouter();
  const fromSegment = useSearchParams().get("from");
  const { data: schema, isLoading } = useSchema(connectionId);
  const { data: cachedAnalysis } = useAnalysis(connectionId);
  const sourceTable = schema?.tables.find((t) => t.name === tableName);
  const sourcePk = sourceTable && fromSegment ? decodePkSegment(sourceTable, fromSegment) : null;
  // "Duplicate row" lands here with ?from=<pk>; fetch the source so the
  // form opens prefilled (minus the primary key + generated columns).
  const { data: sourceRow, isLoading: sourceLoading } = useRow(connectionId, sourceTable, sourcePk);

  if (connection.myRole === "viewer") {
    return (
      <EmptyState
        title="Viewer access"
        description="Editors and owners can create rows. You can still browse, search, filter, and export this table."
        action={
          <Button asChild variant="secondary">
            <Link href={`/c/${connectionId}/tables/${encodeURIComponent(tableName)}`}>Back to table</Link>
          </Button>
        }
      />
    );
  }

  if (isLoading || (sourcePk && sourceLoading)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const table = sourceTable;

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
        description="Views are read-only: you cannot insert rows here."
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
        title={`${sourceRow ? "Duplicate" : "New"} ${analysis?.category === "users" ? "user" : analysis?.category === "content" ? "post" : "row"}`}
        subtitle={<span className="font-mono text-xs">{table.schema}.{table.name}</span>}
        eyebrow={
          sourceRow ? (
            <>
              <CopyPlus className="h-3 w-3 text-accent" aria-hidden /> prefilled from an existing row
            </>
          ) : analysis ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden /> AI · {analysis.category}
            </>
          ) : null
        }
      />
      <div className="surface rounded-md p-6">
        <RowForm
          key={sourceRow ? "duplicate" : "blank"}
          table={table}
          schema={schema!}
          mode="create"
          initialRow={sourceRow ?? undefined}
          onCancel={() => router.push(tableHref)}
        />
      </div>
    </div>
  );
}
