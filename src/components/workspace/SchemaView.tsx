"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Key, Link2, Search } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/workspace/EmptyState";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

export function SchemaView() {
  const connectionId = useCurrentConnectionId();
  const { data: schema, isLoading, error } = useSchema(connectionId);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const tables = schema?.tables ?? [];
    if (!filter.trim()) return tables;
    const needle = filter.trim().toLowerCase();
    return tables.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.columns.some((c) => c.name.toLowerCase().includes(needle)),
    );
  }, [schema, filter]);

  if (error) {
    return (
      <ErrorBanner
        error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Schema</h1>
        <p className="text-sm text-fg-muted">
          Every table and column, as introspected from your project's OpenAPI document.
        </p>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
        <Input
          placeholder="Filter tables or columns…"
          className="pl-9"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter schema"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a shorter filter." />
      ) : (
        <ul className="space-y-4">
          {filtered.map((t) => (
            <li key={`${t.schema}.${t.name}`} className="surface overflow-hidden rounded">
              <header className="flex items-center justify-between gap-2 border-b hairline bg-bg-sunken px-4 py-3">
                <Link
                  href={`/c/${connectionId}/tables/${encodeURIComponent(t.name)}`}
                  className="flex items-center gap-2 truncate hover:text-accent"
                >
                  <span className="font-mono text-sm">{t.name}</span>
                  {t.kind === "view" && (
                    <Badge tone="warn">
                      <Eye className="h-3 w-3" aria-hidden /> view
                    </Badge>
                  )}
                </Link>
                <span className="text-[10px] uppercase tracking-wider text-fg-faint">
                  {t.columns.length} cols · pk: {t.primaryKey.length ? t.primaryKey.join(", ") : "—"}
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-[10px] uppercase tracking-wider text-fg-faint">
                    <tr className="border-b hairline">
                      <th scope="col" className="px-4 py-2 font-medium">column</th>
                      <th scope="col" className="px-4 py-2 font-medium">type</th>
                      <th scope="col" className="px-4 py-2 font-medium">nullable</th>
                      <th scope="col" className="px-4 py-2 font-medium">default</th>
                      <th scope="col" className="px-4 py-2 font-medium">notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.columns.map((c) => (
                      <tr key={c.name} className="border-b hairline last:border-0">
                        <td className={cn("px-4 py-2 font-mono text-xs", c.isPrimaryKey && "text-accent")}>
                          <span className="inline-flex items-center gap-1">
                            {c.isPrimaryKey && <Key className="h-3 w-3" aria-hidden />}
                            {c.name}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-[11px] text-fg-muted">
                          {c.pgType}
                          {c.category === "enum" && c.enumValues && (
                            <span className="ml-2 text-[10px] text-fg-faint">
                              ({c.enumValues.join(" | ")})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {c.nullable ? (
                            <span className="text-fg-faint">yes</span>
                          ) : (
                            <span className="text-fg">no</span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-[11px] text-fg-muted">{c.defaultValue ?? "—"}</td>
                        <td className="px-4 py-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1">
                            {c.fk && (
                              <Badge tone="accent">
                                <Link2 className="h-3 w-3" aria-hidden />
                                {c.fk.table}.{c.fk.column}
                              </Badge>
                            )}
                            {c.isGenerated && <Badge>generated</Badge>}
                            {c.comment && <span className="text-fg-faint">{c.comment}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
