import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { TableTile } from "@/components/data/TableTile";
import { EmptyState } from "@/components/workspace/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/connect/ErrorBanner";
import { AppError } from "@/lib/api/errors";

export function TablesRoute() {
  const { data: schema, isLoading, error } = useSchema();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const all = schema?.tables ?? [];
    if (!filter.trim()) return all;
    const needle = filter.trim().toLowerCase();
    return all.filter((t) => t.name.toLowerCase().includes(needle));
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
        <h1 className="font-display text-display-md">Tables</h1>
        <p className="text-sm text-fg-muted">
          {schema?.tables.length ?? "—"} tables · {schema?.tables.filter((t) => t.kind === "view").length ?? 0} views
        </p>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
        <Input
          placeholder="Filter tables…"
          className="pl-9"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter tables by name"
        />
      </div>

      {isLoading ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i}><Skeleton className="h-28 w-full" /></li>
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <EmptyState title="No tables match" description="Try a shorter filter." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <li key={t.name}>
              <TableTile table={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
