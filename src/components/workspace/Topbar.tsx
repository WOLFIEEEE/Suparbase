import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "@/lib/connection/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SidebarNav } from "./Sidebar";
import type { KeyRole } from "@/lib/connection/jwt";

const roleTone: Record<KeyRole, "neutral" | "accent" | "warn" | "danger"> = {
  anon: "accent",
  authenticated: "accent",
  service_role: "danger",
  unknown: "warn",
};

const roleLabel: Record<KeyRole, string> = {
  anon: "anon",
  authenticated: "user",
  service_role: "service-role",
  unknown: "unknown",
};

export function Topbar() {
  const { connection } = useConnection();
  const qc = useQueryClient();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function refreshSchema() {
    if (!connection) return;
    // Invalidate every query under this host so nothing stale survives a refresh.
    qc.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[1] === connection.hostname,
    });
  }

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b hairline bg-bg px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </Button>
          <Link
            to="/settings"
            className="flex items-center gap-2 truncate font-mono text-xs text-fg-muted hover:text-fg"
            aria-label="Connection settings"
          >
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="truncate">{connection?.hostname ?? "—"}</span>
          </Link>
          {connection && (
            <Badge tone={roleTone[connection.role]}>{roleLabel[connection.role]}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={refreshSchema}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Refresh schema</span>
          </Button>
        </div>
      </header>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent side="right" className="max-w-[18rem] p-0" hideClose>
          <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
