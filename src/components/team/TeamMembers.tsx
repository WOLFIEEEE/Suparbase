"use client";

/**
 * Team members + pending invitations on /c/[id]/settings.
 * Owner-only mutations; everyone with access can see the roster.
 */

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Mail,
  Plus,
  Trash2,
  UserCheck,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { InvitationSummary, MemberRole, MemberSummary, TeamSnapshot } from "@/lib/team/types";

interface Props {
  connectionId: string;
}

async function fetchTeam(connectionId: string): Promise<TeamSnapshot> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/members`);
  if (!res.ok) throw new AppError("server", "Failed to load team.");
  return (await res.json()) as TeamSnapshot;
}

export function TeamMembers({ connectionId }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["team", connectionId],
    queryFn: () => fetchTeam(connectionId),
  });
  const [openInvite, setOpenInvite] = useState(false);
  const [shareInvite, setShareInvite] = useState<InvitationSummary | null>(null);

  const myRole = data?.myRole ?? "viewer";
  const canManage = myRole === "owner";

  const refresh = () => qc.invalidateQueries({ queryKey: ["team", connectionId] });

  const removeMember = useCallback(
    async (m: MemberSummary) => {
      if (!confirm(`Remove ${m.email ?? m.name ?? "this member"} from the team?`)) return;
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/members/${encodeURIComponent(m.id)}`,
        { method: "DELETE" },
      );
      if (res.status === 204) {
        toast.success("Member removed.");
        refresh();
      } else {
        toast.error("Remove failed.");
      }
    },
    [connectionId],
  );

  const changeRole = useCallback(
    async (m: MemberSummary, role: MemberRole) => {
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/members/${encodeURIComponent(m.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      if (res.ok) {
        toast.success(`Role updated to ${role}.`);
        refresh();
      } else {
        toast.error("Update failed.");
      }
    },
    [connectionId],
  );

  const revokeInvite = useCallback(
    async (inv: InvitationSummary) => {
      if (!confirm(`Revoke invitation for ${inv.email}?`)) return;
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/members/invitations/${encodeURIComponent(inv.id)}`,
        { method: "DELETE" },
      );
      if (res.status === 204) {
        toast.success("Invitation revoked.");
        refresh();
      } else {
        toast.error("Revoke failed.");
      }
    },
    [connectionId],
  );

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base">Team</h3>
          <p className="text-xs text-fg-muted">
            Invite teammates so support / ops / finance can access this
            connection. Owners can manage members.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setOpenInvite(true)}>
            <Plus className="h-3 w-3" aria-hidden />
            Invite teammate
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="rounded-md border hairline bg-bg-raised px-3 py-2 text-sm text-fg-muted">
          Loading…
        </div>
      ) : (
        <>
          {data && data.members.length === 0 ? (
            <p className="rounded-md border hairline bg-bg-raised px-3 py-2 text-xs text-fg-faint">
              Just you for now. Invite a teammate to start collaborating.
            </p>
          ) : (
            <ul className="divide-y hairline overflow-hidden rounded-md border hairline bg-bg-raised">
              {data?.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-xs",
                      "bg-bg-sunken text-fg-muted",
                    )}
                  >
                    {(m.email ?? m.name ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg">
                      {m.name ?? m.email ?? m.userId}
                    </div>
                    <div className="truncate font-mono text-[11px] text-fg-faint">
                      {m.email}
                      <span className="mx-1.5">·</span>
                      joined {relativeFromNow(m.acceptedAt)}
                    </div>
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-1">
                      <Select
                        value={m.role}
                        onValueChange={(v) => changeRole(m, v as MemberRole)}
                      >
                        <SelectTrigger className="h-8 w-[6.5rem] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor">editor</SelectItem>
                          <SelectItem value="viewer">viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeMember(m)}
                        aria-label="Remove member"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <Badge>{m.role}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && data && data.invitations.length > 0 && (
            <>
              <h4 className="mt-4 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                Pending invitations · {data.invitations.length}
              </h4>
              <ul className="divide-y hairline overflow-hidden rounded-md border hairline bg-bg-raised">
                {data.invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Mail className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{inv.email}</div>
                      <div className="font-mono text-[11px] text-fg-faint">
                        invited {relativeFromNow(inv.createdAt)} · expires{" "}
                        {relativeFromNow(inv.expiresAt)} · {inv.role}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setShareInvite(inv)}
                    >
                      <Copy className="h-3 w-3" aria-hidden />
                      Get link
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => revokeInvite(inv)}
                      aria-label="Revoke invitation"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {openInvite && (
        <InviteDialog
          connectionId={connectionId}
          onClose={() => setOpenInvite(false)}
          onCreated={(inv) => {
            qc.invalidateQueries({ queryKey: ["team", connectionId] });
            setOpenInvite(false);
            setShareInvite(inv);
          }}
        />
      )}

      {shareInvite && (
        <ShareInviteDialog invitation={shareInvite} onClose={() => setShareInvite(null)} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Invite dialog
// ---------------------------------------------------------------------------

function InviteDialog({
  connectionId,
  onClose,
  onCreated,
}: {
  connectionId: string;
  onClose: () => void;
  onCreated: (inv: InvitationSummary) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/connections/${encodeURIComponent(connectionId)}/members/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role }),
        },
      );
      const j = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError((j.message as string | undefined) ?? `HTTP ${res.status}`);
        return;
      }
      onCreated(j as unknown as InvitationSummary);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-accent" aria-hidden />
          Invite teammate
        </DialogTitle>
        <DialogDescription>
          v2.4 ships invite-by-link. Generate a link, share it with your
          teammate, and they accept by signing in with the same email.
        </DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-[0.16em] text-fg-faint">
              Email
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] uppercase tracking-[0.16em] text-fg-faint">
              Role
            </label>
            <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">editor · read + write</SelectItem>
                <SelectItem value="viewer">viewer · read only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-fg-faint">
              Editors can write; viewers can read. (Server-side write
              gating lands in v2.4.x — for now the UI hides edit
              buttons for viewers.)
            </p>
          </div>
          {error && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Plus className="h-3 w-3" aria-hidden />
              {saving ? "Inviting…" : "Generate invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShareInviteDialog({
  invitation,
  onClose,
}: {
  invitation: InvitationSummary;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/invitations/${invitation.token}`
      : `/invitations/${invitation.token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy link.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-accent" aria-hidden />
          Share this link with {invitation.email}
        </DialogTitle>
        <DialogDescription>
          Anyone with this URL who can sign in with {invitation.email}
          will become a {invitation.role}. Link expires in 7 days.
        </DialogDescription>
        <div className="space-y-2">
          <code className="block break-all rounded border hairline bg-bg-sunken px-3 py-2 font-mono text-[11px] text-fg">
            {url}
          </code>
          <Button onClick={copy} className="w-full">
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copy link
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
