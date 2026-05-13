import { ChevronLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";
import { RowForm } from "@/components/row/RowForm";
import { useSchema } from "@/lib/api/hooks";

export function TableNewRoute() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: schema, isLoading } = useSchema();

  if (isLoading) return null;
  const table = schema?.tables.find((t) => t.name === name);

  if (!table) {
    return (
      <EmptyState
        title="Table not found"
        description={`No table named "${name}".`}
        action={
          <Button asChild variant="secondary">
            <Link to="/tables">All tables</Link>
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
            <Link to={`/tables/${encodeURIComponent(table.name)}`}>Open view</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/tables/${encodeURIComponent(table.name)}`}
        className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-fg"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {table.name}
      </Link>
      <header className="space-y-1">
        <h1 className="font-display text-display-md">New row</h1>
        <p className="text-sm text-fg-muted font-mono">{table.name}</p>
      </header>
      <div className="surface rounded p-6">
        <RowForm
          table={table}
          schema={schema!}
          mode="create"
          onCancel={() => navigate(`/tables/${encodeURIComponent(table.name)}`)}
        />
      </div>
    </div>
  );
}
