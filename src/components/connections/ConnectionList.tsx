"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Pencil, AlertTriangle } from "lucide-react";
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
import { AppError } from "@/lib/errors";
import { pgrest } from "@/lib/pgrest/client";
import type { ConnectionSummary, KeyRole } from "@/lib/types/connection";

interface Props {
  initial: ConnectionSummary[];
}

const ROLE_TONE: Record<KeyRole, "neutral" | "accent" | "warn" | "danger"> = {
  anon: "accent",
  authenticated: "accent",
  service_role: "danger",
  unknown: "warn",
};

async function fetchConnections(): Promise<ConnectionSummary[]> {
  const res = await fetch("/api/connections");
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed to load connections.");
  }
  return res.json();
}

async function patchConnection(id: string, name: string): Promise<ConnectionSummary> {
  const res = await fetch(`/api/connections/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Update failed.");
  }
  return res.json();
}

async function deleteConnection(id: string): Promise<void> {
  const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Delete failed.");
  }
}

void pgrest; // keep the import side-effect clear that pgrest is used elsewhere

export function ConnectionList({ initial }: Props) {
  const { data: connections = initial } = useQuery({
    queryKey: ["connections"],
    queryFn: fetchConnections,
    initialData: initial,
    staleTime: 10_000,
  });

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {connections.map((c) => (
        <li key={c.id}>
          <ConnectionCard connection={c} />
        </li>
      ))}
    </ul>
  );
}

function ConnectionCard({ connection }: { connection: ConnectionSummary }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(connection.name);

  const renameMutation = useMutation({
    mutationFn: (name: string) => patchConnection(connection.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      toast.success("Renamed");
      setRenameOpen(false);
    },
    onError: (e) => toast.error(`Rename failed: ${(e as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteConnection(connection.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      toast.success("Connection deleted");
      setDeleteOpen(false);
      router.refresh();
    },
    onError: (e) => toast.error(`Delete failed: ${(e as Error).message}`),
  });

  return (
    <>
      <article className="group relative rounded border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong">
        <Link
          href={`/c/${connection.id}`}
          className="block space-y-2"
          aria-label={`Open ${connection.name}`}
        >
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg">{connection.name}</h3>
            <Badge tone={ROLE_TONE[connection.role]}>{connection.role}</Badge>
          </div>
          <p className="truncate font-mono text-xs text-fg-faint">{connection.hostname}</p>
          {connection.role === "service_role" && (
            <p className="flex items-center gap-1 text-[10px] text-warn">
              <AlertTriangle className="h-3 w-3" aria-hidden /> bypasses RLS
            </p>
          )}
          <p className="text-[10px] text-fg-faint">
            last used {new Date(connection.lastUsedAt).toLocaleString()}
          </p>
        </Link>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setNameDraft(connection.name);
              setRenameOpen(true);
            }}
          >
            <Pencil className="h-3 w-3" aria-hidden />
            Rename
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            Delete
          </Button>
        </div>
      </article>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename connection</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-name">Name</Label>
            <Input
              id="rename-name"
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
            <Button onClick={() => renameMutation.mutate(nameDraft.trim())} disabled={!nameDraft.trim() || renameMutation.isPending}>
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
              Your Supabase project is not touched.
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
    </>
  );
}
