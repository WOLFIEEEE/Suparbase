import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/workspace/PageHeader";
import { ConnectionImportPanel } from "@/components/connections/ConnectionImportPanel";

export const metadata: Metadata = { title: "Import connections · Suparbase" };

export default function ImportConnectionsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader
        breadcrumbs={[
          { label: "Connections", href: "/connections" },
          { label: "Import" },
        ]}
        title="Import connections"
        subtitle={
          <span className="text-sm text-fg-muted">
            Bulk-add Supabase projects from a JSON array or CSV. Start from an export of another account
            (Connections → Export) and paste the keys back in.
          </span>
        }
        eyebrow={
          <>
            <Upload className="h-3 w-3 text-accent" aria-hidden />
            Bulk setup
          </>
        }
      />
      <ConnectionImportPanel />
    </div>
  );
}
