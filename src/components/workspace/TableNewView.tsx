"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";
import { RowForm } from "@/components/row/RowForm";

export function TableNewView({ tableName }: { tableName: string }) {
  const connectionId = useCurrentConnectionId();
  const router = useRouter();
  const { data: schema, isLoading } = useSchema(connectionId);

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

  return (
    <div className="space-y-6">
      <Link
        href={`/c/${connectionId}/tables/${encodeURIComponent(table.name)}`}
        className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {table.name}
      </Link>
      <header className="space-y-1">
        <h1 className="font-display text-display-md">New row</h1>
        <p className="font-mono text-sm text-fg-muted">{table.name}</p>
      </header>
      <div className="surface rounded p-6">
        <RowForm
          table={table}
          schema={schema!}
          mode="create"
          onCancel={() => router.push(`/c/${connectionId}/tables/${encodeURIComponent(table.name)}`)}
        />
      </div>
    </div>
  );
}
