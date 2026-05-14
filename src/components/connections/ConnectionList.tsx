"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Database,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
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

const ROLE_LABEL: Record<KeyRole, string> = {
  anon: "anon",
  authenticated: "user",
  service_role: "service-role",
  unknown: "unknown",
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

  const lastUsed = relativeFromNow(connection.lastUsedAt);

  return (
    <>
      <article className="group relative rounded-md border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong">
        {/* Whole-card click overlay → open workspace */}
        <Link
          href={`/c/${connection.id}`}
          className="absolute inset-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`Open ${connection.name}`}
        />

        <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              <h3 className="truncate font-display text-lg leading-tight">{connection.name}</h3>
            </div>
            <p className="truncate font-mono text-[11px] text-fg-faint">{connection.hostname}</p>
          </div>
          <div className="pointer-events-auto relative z-20 flex shrink-0 items-center gap-1.5">
            <Badge tone={ROLE_TONE[connection.role]}>{ROLE_LABEL[connection.role]}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1.5 text-fg-faint opacity-0 transition-opacity hover:bg-bg-sunken hover:text-fg group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={`Actions for ${connection.name}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem asChild>
                  <Link href={`/c/${connection.id}`}>
                    <ArrowRight className="mr-2 h-3.5 w-3.5" aria-hidden /> Open workspace
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/c/${connection.id}/settings`}>Open settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setNameDraft(connection.name);
                    setRenameOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setDeleteOpen(true);
                  }}
                  className="text-danger focus:text-danger"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="pointer-events-none relative z-10 mt-4 flex items-center justify-between gap-2 border-t hairline pt-3">
          {connection.role === "service_role" ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-warn">
              <AlertTriangle className="h-3 w-3" aria-hidden /> bypasses RLS
            </span>
          ) : (
            <span className="text-[10px] text-fg-faint">
              {lastUsed ? `used ${lastUsed}` : `created ${relativeFromNow(connection.createdAt) ?? ""}`}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] text-fg-faint group-hover:text-accent">
            Open <ArrowRight className="h-3 w-3" aria-hidden />
          </span>
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
              Removes <code className="font-mono text-fg">{connection.name}</code> from your account. Your
              Supabase project itself is not touched.
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
