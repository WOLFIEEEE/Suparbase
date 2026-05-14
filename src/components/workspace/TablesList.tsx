"use client";
import { useMemo, useState } from "react";
import { Activity, FileText, Layers, Search, Users as UsersIcon, X } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useCurrentConnectionId, useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { TableTile } from "@/components/data/TableTile";
import { EmptyState } from "@/components/workspace/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PageHeader } from "@/components/workspace/PageHeader";
import { AppError } from "@/lib/errors";
import {
  ARCHETYPE_HINT,
  ARCHETYPE_LABEL,
  groupTablesByArchetype,
} from "@/lib/presets/groupTables";
import type { Table } from "@/lib/types/schema";

export function TablesList() {
  const connection = useCurrentConnection();
  const connectionId = useCurrentConnectionId();
  const { data: schema, isLoading, error } = useSchema(connectionId);
  const { data: cachedAnalysis } = useAnalysis(connectionId);
  const analyses = analysisOrNull(cachedAnalysis)?.tables;

  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const all = schema?.tables ?? [];
    const needle = filter.trim().toLowerCase();
    const visible = needle ? all.filter((t) => t.name.toLowerCase().includes(needle)) : all;
    return groupTablesByArchetype(visible, analyses);
  }, [schema, analyses, filter]);

  const totalVisible = useMemo(() => {
    return (
      groups.users.length +
      groups.content.length +
      groups.logs.length +
      groups.generic.length +
      groups.system.length
    );
  }, [groups]);

  if (error) {
    return (
      <ErrorBanner
        error={
          error instanceof AppError
            ? error
            : new AppError("client_bug", String((error as Error).message ?? error))
        }
      />
    );
  }

  const totalAll = schema?.tables.length ?? 0;
  const totalNonSystem = totalAll - (schema?.tables.filter((t) => t.schema === "auth" || t.schema === "storage").length ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "Tables" },
        ]}
        title="Tables"
        subtitle={
          <span className="text-xs text-fg-muted">
            {schema ? (
              <>
                {totalNonSystem} {totalNonSystem === 1 ? "table" : "tables"} grouped by archetype
              </>
            ) : (
              ":"
            )}
          </span>
        }
      />

      <div className="relative max-w-md">
        <Search
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
          aria-hidden
        />
        <Input
          placeholder="Filter every section…"
          className="pl-9 pr-9"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter tables by name across all groups"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg"
            aria-label="Clear filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-28 w-full rounded" />
            </li>
          ))}
        </ul>
      ) : totalVisible === 0 ? (
        filter ? (
          <EmptyState title="No tables match" description={`Nothing matches "${filter}".`} />
        ) : (
          <EmptyState
            title="No tables yet"
            description="This project's public schema has no tables. Add tables in Supabase and refresh."
          />
        )
      ) : (
        <div className="space-y-8">
          <Group kind="users" icon={UsersIcon} tables={groups.users} />
          <Group kind="content" icon={FileText} tables={groups.content} />
          <Group kind="logs" icon={Activity} tables={groups.logs} />
          <Group kind="generic" icon={Layers} tables={groups.generic} />
          {groups.system.length > 0 && (
            <details className="surface rounded-md px-5 py-4 text-sm">
              <summary className="cursor-pointer select-none text-fg-faint hover:text-fg">
                System tables ({groups.system.length})
              </summary>
              <p className="mt-2 text-[11px] text-fg-faint">{ARCHETYPE_HINT.system}</p>
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groups.system.map((t) => (
                  <li key={`${t.schema}.${t.name}`}>
                    <TableTile table={t} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  kind,
  icon: Icon,
  tables,
}: {
  kind: "users" | "content" | "logs" | "generic";
  icon: typeof UsersIcon;
  tables: Table[];
}) {
  if (tables.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-2 font-display text-base">
            <Icon className="h-4 w-4 text-fg-muted" aria-hidden />
            {ARCHETYPE_LABEL[kind]}
            <span className="text-fg-faint tabular-nums">· {tables.length}</span>
          </h2>
          <p className="text-xs text-fg-faint">{ARCHETYPE_HINT[kind]}</p>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((t) => (
          <li key={`${t.schema}.${t.name}`}>
            <TableTile table={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}
