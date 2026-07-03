"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One-click CSV download of this connection's audit log (most recent
 * 10,000 writes). The link hits a server route that streams the file, so
 * nothing sensitive is assembled in the browser.
 */
export function AuditExportSection({ connectionId }: { connectionId: string }) {
  return (
    <section className="surface space-y-4 rounded-md p-6">
      <header className="space-y-1">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Audit log</h2>
        <p className="text-xs text-fg-muted">
          Every write proxied through Suparbase is recorded with before/after values.
          Export the most recent 10,000 entries as CSV for compliance or offline review.
        </p>
      </header>
      <Button asChild size="sm" variant="secondary">
        <a href={`/api/v/${connectionId}/audit/export`} download>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download CSV
        </a>
      </Button>
    </section>
  );
}
