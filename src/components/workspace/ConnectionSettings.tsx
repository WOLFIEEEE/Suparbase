"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Calendar, KeyRound, Pencil, Shield, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/workspace/PageHeader";
import { TeamMembers } from "@/components/team/TeamMembers";
import { PostgresUrlSection } from "@/components/connections/PostgresUrlSection";
import { ConnectionHealthCard } from "@/components/workspace/ConnectionHealthCard";
import { AlertWebhookSection } from "@/components/workspace/AlertWebhookSection";
import { AuditExportSection } from "@/components/workspace/AuditExportSection";
import { EnvironmentSection } from "@/components/workspace/EnvironmentSection";
import { SentryScheduleSection } from "@/components/workspace/SentryScheduleSection";
import { EnvironmentBadge } from "@/components/connections/EnvironmentBadge";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import type { ConnectionSummary, KeyRole } from "@/lib/types/connection";

const ROLE_LABEL: Record<KeyRole, string> = {
  anon: "anon",
  authenticated: "authenticated",
  service_role: "service_role · bypasses RLS",
  unknown: "unknown",
};

const ROLE_TONE: Record<KeyRole, "neutral" | "accent" | "warn" | "danger"> = {
  anon: "accent",
  authenticated: "accent",
  service_role: "danger",
  unknown: "warn",
};

async function patchConnection(id: string, name: string): Promise<ConnectionSummary> {
  const res = await fetch(`/api/connections/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed.");
  }
  return res.json();
}

async function deleteConnectionApi(id: string): Promise<void> {
  const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed.");
  }
}

export function ConnectionSettings({ connection }: { connection: ConnectionSummary }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(connection.name);

  const renameMutation = useMutation({
    mutationFn: (name: string) => patchConnection(connection.id, name),
    onSuccess: () => {
      toast.success("Renamed");
      setRenameOpen(false);
      qc.invalidateQueries({ queryKey: ["connections"] });
      router.refresh();
    },
    onError: (e) => toast.error(`Rename failed: ${(e as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConnectionApi(connection.id),
    onSuccess: () => {
      toast.success("Connection deleted");
      qc.clear();
      router.push("/connections");
    },
    onError: (e) => toast.error(`Delete failed: ${(e as Error).message}`),
  });

  const created = relativeFromNow(connection.createdAt);
  const lastUsed = relativeFromNow(connection.lastUsedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: connection.name, href: `/c/${connection.id}` },
          { label: "Settings" },
        ]}
        title="Connection settings"
        subtitle={
          <span className="font-mono text-xs text-fg-muted">{connection.hostname}</span>
        }
      />

      {connection.role === "service_role" && (
        <Alert tone="danger">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Service-role key in use
          </AlertTitle>
          <AlertDescription>
            This key bypasses Row-Level Security. The encrypted blob lives on our server; the plaintext key is
            only ever decrypted when proxying requests on your behalf: it never reaches the browser.
          </AlertDescription>
        </Alert>
      )}

      <ConnectionHealthCard connectionId={connection.id} />

      {/* ── Identity ── */}
      <section className="surface space-y-4 rounded-md p-6">
        <header className="space-y-1">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Identity</h2>
          <p className="text-xs text-fg-muted">The display name used in the sidebar, palette, and dashboard.</p>
        </header>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 font-medium">
              {connection.name}
              <EnvironmentBadge environment={connection.environment} />
            </div>
            <div className="font-mono text-[11px] text-fg-faint">
              {connection.hostname}
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setNameDraft(connection.name);
              setRenameOpen(true);
            }}
          >
            <Pencil className="h-3 w-3" aria-hidden /> Rename
          </Button>
        </div>
      </section>

      <EnvironmentSection connection={connection} />

      {/* ── Security ── */}
      <section className="surface space-y-4 rounded-md p-6">
        <header className="space-y-1">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Security</h2>
          <p className="text-xs text-fg-muted">
            The API key is encrypted with AES-256-GCM at rest. Rotation needs a new connection.
          </p>
        </header>
        <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-[10rem_1fr]">
          <div className="contents">
            <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
              <KeyRound className="h-3 w-3" /> Key role
            </dt>
            <dd>
              <Badge tone={ROLE_TONE[connection.role]}>{ROLE_LABEL[connection.role]}</Badge>
            </dd>
          </div>
          <div className="contents">
            <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Shield className="h-3 w-3" /> Encryption
            </dt>
            <dd className="text-xs text-fg">
              AES-256-GCM · versioned ciphertext supports key rotation server-side
            </dd>
          </div>
          <div className="contents">
            <dt className="text-xs text-fg-muted">Project URL</dt>
            <dd className="font-mono text-[11px] text-fg-muted">{connection.url}</dd>
          </div>
          <div className="contents">
            <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Calendar className="h-3 w-3" /> Created
            </dt>
            <dd className="text-xs text-fg">
              {created ?? new Date(connection.createdAt).toLocaleString()}
            </dd>
          </div>
          <div className="contents">
            <dt className="text-xs text-fg-muted">Last used</dt>
            <dd className="text-xs text-fg">
              {lastUsed ?? "never"}
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Danger zone ── */}
      <section className="space-y-3 rounded-md border border-danger/30 bg-danger/5 p-6">
        <header className="space-y-1">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-danger">Danger zone</h2>
          <p className="text-xs text-fg-muted">
            Deletes this connection from your account. Your Supabase project is not touched; audit log rows are
            retained with the link removed.
          </p>
        </header>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete connection
        </Button>
      </section>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename connection</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="settings-rename">Name</Label>
            <Input
              id="settings-rename"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              maxLength={60}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)} disabled={renameMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => renameMutation.mutate(nameDraft.trim())}
              disabled={!nameDraft.trim() || renameMutation.isPending}
            >
              {renameMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-danger">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              <DialogTitle>Delete this connection?</DialogTitle>
            </div>
            <DialogDescription>
              Removes <code className="font-mono text-fg">{connection.name}</code> from your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PostgresUrlSection connection={connection} />

      <AlertWebhookSection connection={connection} />

      <SentryScheduleSection connection={connection} />

      <AuditExportSection connectionId={connection.id} />

      <section className="surface rounded-md p-6">
        <TeamMembers connectionId={connection.id} />
      </section>
    </div>
  );
}
