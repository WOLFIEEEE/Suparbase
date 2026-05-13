import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Row, Table } from "@/lib/schema/types";
import { formatCellValue } from "@/lib/table/cellFormat";
import { encodePkSegment } from "@/lib/table/pk";
import { cn } from "@/lib/ui/cn";

interface RowDrawerProps {
  table: Table;
  row: Row | null;
  onClose: () => void;
  onDeleteRequest?: (row: Row) => void;
}

function partition(table: Table) {
  const ids = table.columns.filter((c) => c.isPrimaryKey);
  const idNames = new Set(ids.map((c) => c.name));
  const metaPattern = /^(created_at|updated_at|inserted_at|deleted_at)$/i;
  const meta = table.columns.filter((c) => metaPattern.test(c.name));
  const metaNames = new Set(meta.map((c) => c.name));
  const content = table.columns.filter((c) => !idNames.has(c.name) && !metaNames.has(c.name));
  return { ids, content, meta };
}

export function RowDrawer({ table, row, onClose, onDeleteRequest }: RowDrawerProps) {
  const navigate = useNavigate();
  const { ids, content, meta } = partition(table);
  const open = !!row;
  const pkSegment = row && table.primaryKey.length
    ? encodePkSegment(Object.fromEntries(table.primaryKey.map((c) => [c, row[c]])))
    : null;
  const canEdit = table.kind === "table" && table.primaryKey.length > 0;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "e" && canEdit && pkSegment) {
        navigate(`/tables/${encodeURIComponent(table.name)}/${pkSegment}?edit=1`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canEdit, pkSegment, navigate, table.name]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle className="font-mono text-base">{table.name}</DialogTitle>
            {table.kind === "view" && <Badge tone="warn">view · read-only</Badge>}
          </div>
        </DialogHeader>
        {row && (
          <div className="space-y-6">
            {ids.length > 0 && <FieldSection title="Identifiers" cols={ids} row={row} />}
            {content.length > 0 && <FieldSection title="Content" cols={content} row={row} />}
            {meta.length > 0 && <FieldSection title="Metadata" cols={meta} row={row} />}
            <div className="flex flex-wrap gap-2 border-t hairline pt-4">
              {pkSegment && (
                <Button variant="secondary" asChild>
                  <Link to={`/tables/${encodeURIComponent(table.name)}/${pkSegment}`}>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Open in page
                  </Link>
                </Button>
              )}
              {canEdit && pkSegment && (
                <Button asChild>
                  <Link to={`/tables/${encodeURIComponent(table.name)}/${pkSegment}?edit=1`}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit
                  </Link>
                </Button>
              )}
              {canEdit && onDeleteRequest && (
                <Button variant="danger" onClick={() => onDeleteRequest(row)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldSection({ title, cols, row }: { title: string; cols: Table["columns"]; row: Row }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">{title}</h3>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        {cols.map((col) => {
          const value = row[col.name];
          const formatted = formatCellValue(col, value);
          const isLong = formatted.truncated || (typeof value === "string" && value.length > 80);
          return (
            <div key={col.name} className="contents">
              <dt className="font-mono text-xs text-fg-muted">{col.name}</dt>
              <dd
                className={cn(
                  "font-mono text-xs",
                  formatted.isNull && "italic text-fg-faint",
                )}
              >
                {col.category === "json" && value != null ? (
                  <pre className="max-h-48 overflow-auto rounded surface-sunken p-2 text-[11px] leading-relaxed">
                    {(() => {
                      try {
                        const parsed = typeof value === "string" ? JSON.parse(value) : value;
                        return JSON.stringify(parsed, null, 2);
                      } catch {
                        return String(value);
                      }
                    })()}
                  </pre>
                ) : isLong && !formatted.isNull ? (
                  <div className="whitespace-pre-wrap break-words">{String(value)}</div>
                ) : col.category === "boolean" && value !== null && value !== undefined ? (
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                      value ? "bg-accent/10 text-accent" : "bg-line/40 text-fg-muted",
                    )}
                  >
                    {String(value)}
                  </span>
                ) : (
                  formatted.text
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
