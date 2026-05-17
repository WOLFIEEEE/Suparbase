"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Eye,
  FileText,
  Key,
  Layers,
  Link2,
  Search,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useCurrentConnection, useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/workspace/EmptyState";
import { PageHeader } from "@/components/workspace/PageHeader";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import {
  ARCHETYPE_HINT,
  ARCHETYPE_LABEL,
  groupTablesByArchetype,
} from "@/lib/presets/groupTables";
import type { Column, Table } from "@/lib/types/schema";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

const META_RE = /^(created_at|updated_at|inserted_at|deleted_at|published_at|last_sign_in_at)$/i;

export function SchemaView() {
  const connection = useCurrentConnection();
  const connectionId = useCurrentConnectionId();
  const { data: schema, isLoading, error } = useSchema(connectionId);
  const { data: cachedAnalysis } = useAnalysis(connectionId);
  const analyses = analysisOrNull(cachedAnalysis)?.tables;

  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    const all = schema?.tables ?? [];
    const needle = filter.trim().toLowerCase();
    const visible = needle
      ? all.filter(
          (t) =>
            t.name.toLowerCase().includes(needle) ||
            t.columns.some((c) => c.name.toLowerCase().includes(needle)),
        )
      : all;
    return groupTablesByArchetype(visible, analyses);
  }, [schema, analyses, filter]);

  const totalColumns = useMemo(
    () => (schema?.tables ?? []).reduce((n, t) => n + t.columns.length, 0),
    [schema],
  );
  const totalTables = (schema?.tables.length ?? 0) - groups.system.length;
  const totalVisible =
    groups.users.length +
    groups.content.length +
    groups.logs.length +
    groups.generic.length +
    groups.system.length;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumbs={[{ label: connection.name, href: `/c/${connection.id}` }, { label: "Schema" }]}
          title="Schema"
        />
        <ErrorBanner
          error={
            error instanceof AppError
              ? error
              : new AppError("client_bug", String((error as Error).message ?? error))
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "Schema" },
        ]}
        title="Schema"
        subtitle={
          <span className="text-xs text-fg-muted">
            {schema
              ? `${totalTables} ${totalTables === 1 ? "table" : "tables"} · ${totalColumns} columns`
              : ":"}
          </span>
        }
      />

      <div className="relative max-w-md">
        <Search
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
          aria-hidden
        />
        <Input
          placeholder="Filter tables or columns…"
          className="pl-9 pr-9"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter schema"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-fg-faint hover:text-fg"
            aria-label="Clear filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-md" />
          ))}
        </div>
      ) : totalVisible === 0 ? (
        filter ? (
          <EmptyState title="No matches" description={`Nothing matches "${filter}".`} />
        ) : (
          <EmptyState title="Empty schema" description="This project has no tables yet." />
        )
      ) : (
        <div className="space-y-8">
          <Group kind="users" icon={UsersIcon} tables={groups.users} connectionId={connectionId} />
          <Group kind="content" icon={FileText} tables={groups.content} connectionId={connectionId} />
          <Group kind="logs" icon={Activity} tables={groups.logs} connectionId={connectionId} />
          <Group kind="generic" icon={Layers} tables={groups.generic} connectionId={connectionId} />
          {groups.system.length > 0 && (
            <details className="surface rounded-md px-5 py-4 text-sm">
              <summary className="cursor-pointer select-none text-fg-faint hover:text-fg">
                System tables ({groups.system.length})
              </summary>
              <p className="mt-2 text-[11px] text-fg-faint">{ARCHETYPE_HINT.system}</p>
              <ul className="mt-3 space-y-2">
                {groups.system.map((t) => (
                  <TableRow key={`${t.schema}.${t.name}`} table={t} connectionId={connectionId} />
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
  connectionId,
}: {
  kind: "users" | "content" | "logs" | "generic";
  icon: typeof UsersIcon;
  tables: Table[];
  connectionId: string;
}) {
  if (tables.length === 0) return null;
  return (
    <section>
      <div className="mb-3 space-y-0.5">
        <h2 className="flex items-center gap-2 font-display text-base">
          <Icon className="h-4 w-4 text-fg-muted" aria-hidden />
          {ARCHETYPE_LABEL[kind]}
          <span className="text-fg-faint tabular-nums">· {tables.length}</span>
        </h2>
        <p className="text-xs text-fg-faint">{ARCHETYPE_HINT[kind]}</p>
      </div>
      <ul className="space-y-2">
        {tables.map((t) => (
          <TableRow key={`${t.schema}.${t.name}`} table={t} connectionId={connectionId} />
        ))}
      </ul>
    </section>
  );
}

function TableRow({ table, connectionId }: { table: Table; connectionId: string }) {
  const idCols = table.columns.filter((c) => c.isPrimaryKey);
  const metaCols = table.columns.filter((c) => META_RE.test(c.name) && !c.isPrimaryKey);
  const fieldCols = table.columns.filter(
    (c) => !c.isPrimaryKey && !META_RE.test(c.name),
  );

  return (
    <li className="surface overflow-hidden rounded-md">
      <details>
        <summary className="group flex cursor-pointer select-none items-center justify-between gap-3 border-b hairline bg-bg-sunken px-4 py-3 hover:bg-bg-sunken/70">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-mono text-sm font-medium">{table.name}</span>
            {table.kind === "view" && (
              <Badge tone="warn">
                <Eye className="h-3 w-3" aria-hidden /> view
              </Badge>
            )}
            {table.schema !== "public" && (
              <Badge>{table.schema}</Badge>
            )}
          </div>
          <span className="flex items-center gap-3 text-[11px] text-fg-faint">
            <span>{table.columns.length} cols</span>
            <span>·</span>
            <span>PK: {table.primaryKey.length > 0 ? table.primaryKey.join(", ") : ":"}</span>
            <Link
              href={`/c/${connectionId}/tables/${encodeURIComponent(table.name)}`}
              className="hidden items-center gap-0.5 rounded px-2 py-0.5 text-fg-faint hover:text-accent sm:inline-flex"
              onClick={(e) => e.stopPropagation()}
            >
              open <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </span>
        </summary>
        <div className="space-y-4 p-4">
          {idCols.length > 0 && <ColumnGroup label="Identifiers" cols={idCols} connectionId={connectionId} />}
          {fieldCols.length > 0 && <ColumnGroup label="Fields" cols={fieldCols} connectionId={connectionId} />}
          {metaCols.length > 0 && <ColumnGroup label="Metadata" cols={metaCols} connectionId={connectionId} />}
        </div>
      </details>
    </li>
  );
}

function ColumnGroup({
  label,
  cols,
  connectionId,
}: {
  label: string;
  cols: Column[];
  connectionId: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{label}</h4>
      <ul className="space-y-1">
        {cols.map((c) => (
          <ColumnLine key={c.name} col={c} connectionId={connectionId} />
        ))}
      </ul>
    </div>
  );
}

function ColumnLine({ col, connectionId }: { col: Column; connectionId: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span
        className={cn(
          "inline-flex min-w-[12rem] items-center gap-1 font-mono",
          col.isPrimaryKey && "text-accent",
        )}
      >
        {col.isPrimaryKey && <Key className="h-3 w-3" aria-hidden />}
        {col.name}
      </span>
      <code className="rounded surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
        {col.pgType}
      </code>
      <span className="text-[10px] text-fg-faint">
        {col.nullable ? "nullable" : "required"}
      </span>
      {col.defaultValue && (
        <span className="text-[10px] text-fg-faint">
          default <code className="font-mono">{col.defaultValue}</code>
        </span>
      )}
      {col.fk && (
        <Link
          href={`/c/${connectionId}/tables/${encodeURIComponent(col.fk.table)}`}
          className="inline-flex items-center gap-1 rounded-full border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] text-accent hover:bg-accent/20"
        >
          <Link2 className="h-3 w-3" aria-hidden />
          {col.fk.table}.{col.fk.column}
        </Link>
      )}
      {col.isGenerated && <Badge>generated</Badge>}
      {col.category === "enum" && col.enumValues && col.enumValues.length > 0 && (
        <span className="text-[10px] text-fg-faint">
          ({col.enumValues.slice(0, 4).join(" | ")}
          {col.enumValues.length > 4 ? "…" : ""})
        </span>
      )}
      {col.comment && <span className="text-[10px] text-fg-faint">{col.comment}</span>}
    </li>
  );
}
