"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download } from "lucide-react";
import { useSchema } from "@/lib/api/hooks";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { schemaToParsed } from "@/lib/tools/from-schema";
import { generateTypesFromTables, type TypeTarget } from "@/lib/tools/types-gen";
import { isSystemTable } from "@/lib/presets/groupTables";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/workspace/EmptyState";
import { PageHeader } from "@/components/workspace/PageHeader";
import { SchemaTabs } from "@/components/workspace/SchemaTabs";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

/** TypeScript interfaces / Zod schemas generated from the live schema. */
export function SchemaTypesView() {
  const connection = useCurrentConnection();
  const { data: schema, isLoading, error } = useSchema(connection.id);
  const [target, setTarget] = useState<TypeTarget>("typescript");
  const [includeSystem, setIncludeSystem] = useState(false);
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => {
    const tables = (schema?.tables ?? []).filter((t) => includeSystem || !isSystemTable(t));
    const parsed = schemaToParsed(tables);
    return generateTypesFromTables(parsed.tables, target, []);
  }, [schema, includeSystem, target]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard is not available in this browser.");
    }
  }

  function download() {
    const blob = new Blob([result.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = target === "zod" ? "schema.zod.ts" : "database.types.ts";
    a.click();
    URL.revokeObjectURL(url);
  }

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: connection.name, href: `/c/${connection.id}` },
        { label: "Schema", href: `/c/${connection.id}/schema` },
        { label: "Types" },
      ]}
      title="Generated types"
      subtitle={
        <span className="text-xs text-fg-muted">
          {result.tableCount} {result.tableCount === 1 ? "table" : "tables"} · generated in your browser from the live schema.
        </span>
      }
      actions={
        <>
          <div className="inline-flex items-center rounded border hairline text-[11px]">
            {(["typescript", "zod"] as TypeTarget[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={cn(
                  "px-2.5 py-1",
                  target === t ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-bg-sunken",
                )}
              >
                {t === "typescript" ? "TypeScript" : "Zod"}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={includeSystem}
              onChange={(e) => setIncludeSystem(e.target.checked)}
              className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
            />
            Include auth / storage
          </label>
          <Button variant="secondary" size="sm" onClick={copy} disabled={!result.code}>
            {copied ? <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="secondary" size="sm" onClick={download} disabled={!result.code}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Download
          </Button>
        </>
      }
      tabs={<SchemaTabs connectionId={connection.id} active="types" />}
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
      ) : !result.code ? (
        <EmptyState title="Nothing to generate" description="This project has no tables with columns in the selected schemas." />
      ) : (
        <pre className="surface max-h-[70vh] overflow-auto rounded-md p-4 font-mono text-xs leading-relaxed">
          <code>{result.code}</code>
        </pre>
      )}
    </div>
  );
}
