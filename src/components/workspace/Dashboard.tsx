"use client";
import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  FileText,
  Layers,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Users as UsersIcon,
} from "lucide-react";
import { useRowCount, useSchema, useRecentAudit, type RecentAuditEntry } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";
import { AnalysisBanner } from "@/components/workspace/AnalysisBanner";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { PageHeader, StatTile } from "@/components/workspace/PageHeader";
import { TableTile } from "@/components/data/TableTile";
import { AppError } from "@/lib/errors";
import { relativeFromNow } from "@/lib/ui/time";
import { encodePkSegment } from "@/lib/table/pk";
import {
  ARCHETYPE_HINT,
  ARCHETYPE_LABEL,
  groupTablesByArchetype,
} from "@/lib/presets/groupTables";
import type { Table } from "@/lib/types/schema";
import type { TableAnalysis, AiSettingsSummary } from "@/lib/types/analysis";

async function fetchAiSettings(): Promise<AiSettingsSummary> {
  const res = await fetch("/api/settings/ai");
  if (!res.ok) throw new AppError("server", "Failed to load AI settings.");
  return res.json();
}

export function Dashboard() {
  const connection = useCurrentConnection();
  const { data: schema, isLoading, error } = useSchema(connection.id);
  const { data: cachedAnalysis } = useAnalysis(connection.id);
  const { data: aiSettings } = useQuery({
    queryKey: ["settings", "ai"],
    queryFn: fetchAiSettings,
    staleTime: 60_000,
  });
  const analyses = analysisOrNull(cachedAnalysis)?.tables;

  const groups = useMemo(
    () => groupTablesByArchetype(schema?.tables ?? [], analyses),
    [schema, analyses],
  );

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

  const totalTables = (schema?.tables.length ?? 0) - groups.system.length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            dashboard
          </>
        }
        title={connection.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-muted">{connection.hostname}</span>
            {schema && (
              <span className="text-xs text-fg-faint">
                · {totalTables} {totalTables === 1 ? "table" : "tables"}
                {groups.system.length > 0 && ` · ${groups.system.length} system`}
              </span>
            )}
          </span>
        }
        actions={<QuickActions connectionId={connection.id} users={groups.users[0] ?? null} hasAiKey={!!aiSettings?.hasKey} />}
      />

      <AnalysisBanner />

      <StatStrip groups={groups} analyses={analyses} connectionId={connection.id} loading={isLoading} />

      {schema && schema.tables.length === 0 ? (
        <EmptyState
          title="No tables yet"
          description="This project's public schema has no tables. Add tables in Supabase and refresh."
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-8">
            <ArchetypeGroup
              kind="users"
              icon={UsersIcon}
              tables={groups.users}
              analyses={analyses}
              loading={isLoading}
            />
            <ArchetypeGroup
              kind="content"
              icon={FileText}
              tables={groups.content}
              analyses={analyses}
              loading={isLoading}
            />
            <ArchetypeGroup
              kind="logs"
              icon={Activity}
              tables={groups.logs}
              analyses={analyses}
              loading={isLoading}
            />
            <ArchetypeGroup
              kind="generic"
              icon={Layers}
              tables={groups.generic}
              analyses={analyses}
              loading={isLoading}
            />
            {groups.system.length > 0 && (
              <details className="surface rounded-md px-5 py-4 text-sm">
                <summary className="cursor-pointer select-none text-fg-faint hover:text-fg">
                  System tables ({groups.system.length})
                </summary>
                <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {groups.system.map((t) => (
                    <li key={`${t.schema}.${t.name}`}>
                      <TableTile table={t} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <aside className="space-y-6">
            <RecentActivity connectionId={connection.id} />
          </aside>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatStrip
// ---------------------------------------------------------------------------

const STRIP_TILE_LABELS: Record<"users" | "content" | "logs" | "generic", string> = {
  users: "Audience",
  content: "Library",
  logs: "Activity",
  generic: "Other tables",
};

const STRIP_TILE_HINTS: Record<"users" | "content" | "logs" | "generic", string> = {
  users: "people in the largest users table",
  content: "items in the largest content table",
  logs: "rows in the largest activity table",
  generic: "tables that don't fit a clean archetype",
};

interface StatStripProps {
  groups: ReturnType<typeof groupTablesByArchetype>;
  analyses: TableAnalysis[] | undefined;
  connectionId: string;
  loading: boolean;
}

function StatStrip({ groups, loading }: StatStripProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StripTile
        kind="users"
        table={groups.users[0] ?? null}
        fallbackCount={groups.users.length}
        loading={loading}
      />
      <StripTile
        kind="content"
        table={groups.content[0] ?? null}
        fallbackCount={groups.content.length}
        loading={loading}
      />
      <StripTile
        kind="logs"
        table={groups.logs[0] ?? null}
        fallbackCount={groups.logs.length}
        loading={loading}
      />
      <StripTile
        kind="generic"
        // For "Other tables" we show the count of tables, not rows.
        table={null}
        fallbackCount={groups.generic.length}
        loading={loading}
      />
    </div>
  );
}

interface StripTileProps {
  kind: "users" | "content" | "logs" | "generic";
  table: Table | null;
  fallbackCount: number;
  loading: boolean;
}

function StripTile({ kind, table, fallbackCount, loading }: StripTileProps) {
  // Order matters: hooks must run unconditionally.
  const conn = useCurrentConnection();
  const { data: count, isLoading: countLoading } = useRowCount(
    table ? conn.id : undefined,
    table ?? undefined,
  );

  let value: React.ReactNode;
  if (loading) {
    value = <Skeleton className="h-7 w-16" />;
  } else if (kind === "generic" || !table) {
    value = fallbackCount.toLocaleString();
  } else if (countLoading) {
    value = <Skeleton className="h-7 w-16" />;
  } else if (count?.count != null) {
    value = count.count.toLocaleString();
  } else {
    value = ":";
  }

  const hint =
    kind === "generic"
      ? STRIP_TILE_HINTS.generic
      : table
      ? table.name
      : "no table of this kind";

  return <StatTile label={STRIP_TILE_LABELS[kind]} value={value} hint={hint} />;
}

// ---------------------------------------------------------------------------
// ArchetypeGroup
// ---------------------------------------------------------------------------

interface ArchetypeGroupProps {
  kind: "users" | "content" | "logs" | "generic";
  icon: typeof UsersIcon;
  tables: Table[];
  analyses: TableAnalysis[] | undefined;
  loading: boolean;
}

function ArchetypeGroup({ kind, icon: Icon, tables, loading }: ArchetypeGroupProps) {
  if (!loading && tables.length === 0) return null;
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
      {loading ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-28 w-full rounded" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((t) => (
            <li key={`${t.schema}.${t.name}`}>
              <TableTile table={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// RecentActivity
// ---------------------------------------------------------------------------

const VERB_TONE: Record<"insert" | "update" | "delete", string> = {
  insert: "bg-accent/10 text-accent",
  update: "bg-warn/10 text-warn",
  delete: "bg-danger/10 text-danger",
};

function RecentActivity({ connectionId }: { connectionId: string }) {
  const { data: entries, isLoading } = useRecentAudit(connectionId, 10);

  return (
    <section className="surface rounded-md p-5">
      <h3 className="mb-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
        Recent activity
      </h3>
      {isLoading ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <Skeleton className="h-5 w-full" />
            </li>
          ))}
        </ul>
      ) : !entries || entries.length === 0 ? (
        <p className="text-xs text-fg-muted leading-relaxed">
          Audit logging populates as you edit rows. Once you create, update, or
          delete data here, you'll see a running stream of changes.
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => (
            <ActivityLine key={e.id} entry={e} connectionId={connectionId} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ActivityLine({
  entry,
  connectionId,
}: {
  entry: RecentAuditEntry;
  connectionId: string;
}) {
  const rel = relativeFromNow(entry.createdAt);
  const pkSegment = entry.primaryKey ? encodePkSegment(entry.primaryKey) : null;
  const href = pkSegment
    ? `/c/${connectionId}/tables/${encodeURIComponent(entry.tableName)}/${pkSegment}`
    : `/c/${connectionId}/tables/${encodeURIComponent(entry.tableName)}`;
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center justify-between gap-2 rounded px-2 py-1.5 -mx-2 hover:bg-bg-sunken"
      >
        <span className="min-w-0 flex items-center gap-2 text-xs">
          <span
            className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${VERB_TONE[entry.verb]}`}
          >
            {entry.verb}
          </span>
          <span className="truncate font-mono text-fg">{entry.tableName}</span>
        </span>
        <span className="shrink-0 text-[11px] text-fg-faint">{rel ?? ""}</span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// QuickActions
// ---------------------------------------------------------------------------

function QuickActions({
  connectionId,
  users,
  hasAiKey,
}: {
  connectionId: string;
  users: Table | null;
  hasAiKey: boolean;
}) {
  return (
    <>
      {users && users.kind === "table" && users.primaryKey.length > 0 && (
        <Button asChild>
          <Link href={`/c/${connectionId}/tables/${encodeURIComponent(users.name)}/new`}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Invite user
          </Link>
        </Button>
      )}
      {hasAiKey && (
        <Button asChild variant="secondary">
          <Link href={`/settings/ai`}>
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden /> AI assistance
          </Link>
        </Button>
      )}
      <Button asChild variant="ghost">
        <Link href={`/c/${connectionId}/settings`}>
          <SettingsIcon className="h-3.5 w-3.5" aria-hidden /> Settings
        </Link>
      </Button>
    </>
  );
}
