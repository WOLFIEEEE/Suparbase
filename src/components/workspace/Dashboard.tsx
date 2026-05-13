"use client";
import { useMemo } from "react";
import { Database, Eye, Table2 } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/workspace/EmptyState";
import { AnalysisBanner } from "@/components/workspace/AnalysisBanner";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { AppError } from "@/lib/errors";
import type { Table } from "@/lib/types/schema";
import { TableTile } from "@/components/data/TableTile";

export function Dashboard() {
  const connectionId = useCurrentConnectionId();
  const { data: schema, isLoading, error } = useSchema(connectionId);

  const { tables, views } = useMemo(() => {
    const tt: Table[] = [];
    const vv: Table[] = [];
    for (const t of schema?.tables ?? []) {
      (t.kind === "view" ? vv : tt).push(t);
    }
    return { tables: tt, views: vv };
  }, [schema]);

  if (error) {
    return (
      <ErrorBanner
        error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-fg-faint">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          dashboard
        </div>
        <h1 className="font-display text-display-md">{schema?.hostname.split(".")[0] ?? "—"}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span className="font-mono text-xs">{schema?.hostname ?? ""}</span>
          {schema && (
            <>
              <span aria-hidden>·</span>
              <span>
                {tables.length} tables
                {views.length > 0 && ` · ${views.length} views`}
              </span>
            </>
          )}
        </p>
      </header>

      <AnalysisBanner />

      <section>
        <SectionHeader icon={Table2} label="Tables" count={tables.length} />
        {isLoading ? (
          <TileSkeletons />
        ) : tables.length === 0 ? (
          <EmptyState
            title="No tables yet"
            description="This project's public schema has no tables. Add tables in Supabase and refresh."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <li key={t.name}>
                <TableTile table={t} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {views.length > 0 && (
        <section>
          <SectionHeader icon={Eye} label="Views" count={views.length} />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {views.map((t) => (
              <li key={t.name}>
                <TableTile table={t} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon: typeof Database; label: string; count: number }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-fg-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </h2>
      <Badge>{count}</Badge>
    </div>
  );
}

function TileSkeletons() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-28 w-full" />
        </li>
      ))}
    </ul>
  );
}
