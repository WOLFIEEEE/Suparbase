import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Shield, Calendar, KeyRound } from "lucide-react";
import { useConnection } from "@/lib/connection/context";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { KeyRole } from "@/lib/connection/jwt";

const ROLE_LABEL: Record<KeyRole, string> = {
  anon: "anon",
  authenticated: "authenticated (user session)",
  service_role: "service_role (bypasses RLS)",
  unknown: "unknown",
};

const ROLE_TONE: Record<KeyRole, "neutral" | "accent" | "warn" | "danger"> = {
  anon: "accent",
  authenticated: "accent",
  service_role: "danger",
  unknown: "warn",
};

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function SettingsRoute() {
  const { connection, disconnect } = useConnection();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  useDocumentTitle("Settings · Suparbase");

  if (!connection) return null;

  function performDisconnect() {
    qc.clear();
    disconnect();
    setConfirming(false);
    navigate("/", { replace: true });
  }

  return (
    <div className="max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Settings</h1>
        <p className="text-sm text-fg-muted">Manage your connection.</p>
      </header>

      {connection.role === "service_role" && (
        <Alert tone="danger">
          <AlertTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Service-role key in use
          </AlertTitle>
          <AlertDescription>
            This key bypasses Row-Level Security. Disconnect when you're done.
          </AlertDescription>
        </Alert>
      )}

      <section className="surface rounded p-6 space-y-4">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">Connection</h2>
        <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-[10rem_1fr]">
          <div className="contents">
            <dt className="text-xs uppercase tracking-wider text-fg-muted">Project</dt>
            <dd className="font-mono text-sm">{connection.hostname}</dd>
          </div>
          <div className="contents">
            <dt className="text-xs uppercase tracking-wider text-fg-muted">URL</dt>
            <dd className="font-mono text-xs text-fg-muted">{connection.url}</dd>
          </div>
          <div className="contents">
            <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted">
              <KeyRound className="h-3 w-3" /> Key role
            </dt>
            <dd>
              <Badge tone={ROLE_TONE[connection.role]}>{ROLE_LABEL[connection.role]}</Badge>
            </dd>
          </div>
          <div className="contents">
            <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-fg-muted">
              <Calendar className="h-3 w-3" /> Connected
            </dt>
            <dd className="text-xs text-fg-muted">{formatTimestamp(connection.connectedAt)}</dd>
          </div>
          <div className="contents">
            <dt className="text-xs uppercase tracking-wider text-fg-muted">Persistence</dt>
            <dd className="text-xs">
              {connection.remember ? (
                <span>Remembered on this device <span className="text-fg-faint">(localStorage)</span></span>
              ) : (
                <span>Tab session only <span className="text-fg-faint">(sessionStorage)</span></span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="surface rounded p-6 space-y-3">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">Disconnect</h2>
        <p className="text-sm text-fg-muted">
          Clears credentials from this browser and returns to the connect screen.
        </p>
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Disconnect
          </Button>
        </div>
      </section>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect from this project?</DialogTitle>
            <DialogDescription>
              Your credentials will be removed from this browser. You'll need to
              re-paste them to reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={performDisconnect}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
