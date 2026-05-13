import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection } from "@/lib/connection/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  return (
    <header className="flex h-14 items-center justify-between border-b hairline bg-bg px-6">
      <div className="flex items-center gap-3 min-w-0">
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!connection) return;
            qc.invalidateQueries({ queryKey: ["schema", connection.hostname] });
            qc.invalidateQueries({ queryKey: ["rowCount", connection.hostname] });
            qc.invalidateQueries({ queryKey: ["rows", connection.hostname] });
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Refresh schema</span>
        </Button>
      </div>
    </header>
  );
}
