"use client";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, KeyRound, Link2 } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { schemaToParsed } from "@/lib/tools/from-schema";
import { isSystemTable } from "@/lib/presets/groupTables";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/workspace/EmptyState";
import { PageHeader } from "@/components/workspace/PageHeader";
import { SchemaTabs } from "@/components/workspace/SchemaTabs";
import { ErdDiagram, downloadSvg } from "@/components/tools/ErdDiagram";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { AppError } from "@/lib/errors";

/** Live entity-relationship diagram of the connection's schema. */
export function SchemaErdView() {
  const connection = useCurrentConnection();
  const { data: schema, isLoading, error } = useSchema(connection.id);
  const [includeSystem, setIncludeSystem] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const parsed = useMemo(() => {
    const tables = (schema?.tables ?? []).filter((t) => includeSystem || !isSystemTable(t));
    return schemaToParsed(tables);
  }, [schema, includeSystem]);

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: connection.name, href: `/c/${connection.id}` },
        { label: "Schema", href: `/c/${connection.id}/schema` },
        { label: "ERD" },
      ]}
      title="Entity-relationship diagram"
      subtitle={
        <span className="text-xs text-fg-muted">
          {parsed.tables.length} tables · {parsed.edges.length} relationships, drawn from the live schema.
        </span>
      }
      actions={
        <>
          <label className="inline-flex items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={includeSystem}
              onChange={(e) => setIncludeSystem(e.target.checked)}
              className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
            />
            Include auth / storage
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => svgRef.current && downloadSvg(svgRef.current, `${connection.hostname}-erd.svg`)}
            disabled={parsed.tables.length === 0}
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Download SVG
          </Button>
        </>
      }
      tabs={<SchemaTabs connectionId={connection.id} active="erd" />}
    />
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorBanner error={error instanceof AppError ? error : new AppError("client_bug", String((error as Error).message ?? error))} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-md" />
      ) : parsed.tables.length === 0 ? (
        <EmptyState title="Nothing to draw" description="This project has no tables in the selected schemas." />
      ) : (
        <div className="space-y-2">
          {parsed.warnings.length > 0 && (
            <ul className="space-y-1">
              {parsed.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-warn">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="surface overflow-auto rounded-md">
            <ErdDiagram ref={svgRef} parsed={parsed} markerId="workspace-erd-arrow" />
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-fg-faint">
            <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" aria-hidden /> primary key</span>
            <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3 text-accent" aria-hidden /> foreign key</span>
          </div>
        </div>
      )}
    </div>
  );
}
