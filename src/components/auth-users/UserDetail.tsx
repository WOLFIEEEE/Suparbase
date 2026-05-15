"use client";

/**
 * Per-auth-user detail page. Pulls together:
 *  - the user profile (existing /api/v/[id]/auth-users/[uid])
 *  - active sessions (new /sessions API, direct Postgres)
 *  - tables in this connection that reference the user (new /related)
 *  - quick actions: send recovery, revoke all sessions, delete user
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  Copy,
  Globe,
  Loader2,
  Mail,
  Monitor,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

interface Props {
  connectionId: string;
  userId: string;
}

interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  emailConfirmedAt: string | null;
  phoneConfirmedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  bannedUntil: string | null;
  providers: string[];
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
}

interface SessionRow {
  id: string;
  userId: string;
  createdAt: string | null;
  updatedAt: string | null;
  refreshedAt: string | null;
  notAfter: string | null;
  ip: string | null;
  userAgent: string | null;
  factorId: string | null;
}

interface RelatedTable {
  schema: string;
  table: string;
  column: string;
  count: number;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new AppError(
      (json.category as AppError["category"] | undefined) ?? "server",
      (json.message as string | undefined) ?? "Request failed.",
    );
  }
  return json as unknown as T;
}

export function UserDetail({ connectionId, userId }: Props) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: user, error: userError } = useQuery({
    queryKey: ["auth-user", connectionId, userId],
    queryFn: async () =>
      parse<AuthUser>(
        await fetch(
          `/api/v/${encodeURIComponent(connectionId)}/auth-users/${encodeURIComponent(userId)}`,
        ),
      ),
  });

  const { data: sessionsData, isFetching: sessionsLoading, error: sessionsError } =
    useQuery({
      queryKey: ["auth-sessions", connectionId, userId],
      queryFn: async () =>
        parse<{ sessions: SessionRow[] }>(
          await fetch(
            `/api/v/${encodeURIComponent(connectionId)}/auth-users/${encodeURIComponent(userId)}/sessions`,
          ),
        ),
      enabled: !!user,
    });
  const sessions = sessionsData?.sessions ?? [];

  const { data: relatedData, isFetching: relatedLoading, error: relatedError } =
    useQuery({
      queryKey: ["auth-related", connectionId, userId],
      queryFn: async () =>
        parse<{ tables: RelatedTable[] }>(
          await fetch(
            `/api/v/${encodeURIComponent(connectionId)}/auth-users/${encodeURIComponent(userId)}/related`,
          ),
        ),
      enabled: !!user,
    });
  const related = relatedData?.tables ?? [];

  const revokeAll = useCallback(async () => {
    if (!confirm("Revoke ALL active sessions for this user?")) return;
    const res = await fetch(
      `/api/v/${encodeURIComponent(connectionId)}/auth-users/${encodeURIComponent(userId)}/sessions`,
      { method: "DELETE" },
    );
    if (res.ok) {
      const j = (await res.json()) as { revoked: number };
      toast.success(`Revoked ${j.revoked} session${j.revoked === 1 ? "" : "s"}.`);
      qc.invalidateQueries({ queryKey: ["auth-sessions", connectionId, userId] });
    } else {
      toast.error("Revoke failed.");
    }
  }, [connectionId, qc, userId]);

  const revokeOne = useCallback(
    async (sessionId: string) => {
      const res = await fetch(
        `/api/v/${encodeURIComponent(connectionId)}/auth-users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      );
      if (res.status === 204) {
        toast.success("Session revoked.");
        qc.invalidateQueries({ queryKey: ["auth-sessions", connectionId, userId] });
      } else {
        toast.error("Revoke failed.");
      }
    },
    [connectionId, qc, userId],
  );

  const sendRecovery = useCallback(async () => {
    if (!user?.email) {
      toast.error("User has no email.");
      return;
    }
    const res = await fetch(
      `/api/v/${encodeURIComponent(connectionId)}/auth-users/${encodeURIComponent(userId)}/recovery`,
      { method: "POST" },
    );
    if (res.ok) {
      const j = (await res.json()) as { actionLink?: string };
      if (j.actionLink) {
        navigator.clipboard?.writeText(j.actionLink).catch(() => {});
        toast.success("Recovery link copied to clipboard.");
      } else {
        toast.success("Recovery email sent.");
      }
    } else {
      toast.error("Send failed.");
    }
  }, [connectionId, user?.email, userId]);

  const onDeleteUser = useCallback(async () => {
    const res = await fetch(
      `/api/v/${encodeURIComponent(connectionId)}/auth-users/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    if (res.status === 204) {
      toast.success("User deleted.");
      window.location.href = `/c/${connectionId}/auth-users`;
    } else {
      toast.error("Delete failed.");
    }
  }, [connectionId, userId]);

  if (userError) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
        {userError instanceof Error ? userError.message : "Failed to load user."}
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex items-center gap-2 rounded-md border hairline bg-bg-raised px-3 py-2 text-sm text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
        Loading user…
      </div>
    );
  }

  const isBanned = user.bannedUntil && new Date(user.bannedUntil) > new Date();

  return (
    <div className="space-y-6">
      {/* Profile + quick actions */}
      <section className="surface relative overflow-hidden rounded-lg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/10 to-transparent"
        />
        <div className="relative flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 min-w-0">
            <h2 className="truncate font-display text-3xl leading-tight">
              {user.email ?? user.phone ?? user.id}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
              <code className="font-mono">{user.id}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(user.id).catch(() => {});
                  toast.success("User id copied.");
                }}
                className="text-fg-faint hover:text-fg"
                aria-label="Copy user id"
              >
                <Copy className="h-3 w-3" aria-hidden />
              </button>
              {user.providers.map((p) => (
                <Badge key={p}>{p}</Badge>
              ))}
              {isBanned && (
                <Badge tone="danger" className="!normal-case">
                  banned · {relativeFromNow(user.bannedUntil!)}
                </Badge>
              )}
              {user.emailConfirmedAt ? (
                <Badge tone="accent">email verified</Badge>
              ) : user.email ? (
                <Badge tone="warn">email unverified</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {user.email && (
              <Button variant="secondary" size="sm" onClick={sendRecovery}>
                <Mail className="h-3.5 w-3.5" aria-hidden /> Send recovery
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={revokeAll}>
              <Ban className="h-3.5 w-3.5" aria-hidden /> Revoke sessions
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete user
            </Button>
          </div>
        </div>
        <div className="relative grid grid-cols-2 gap-x-4 gap-y-1.5 border-t hairline px-6 py-3 text-[11px] sm:grid-cols-4">
          <Kv label="Created" value={fmtAbs(user.createdAt)} />
          <Kv label="Last sign-in" value={fmtAbs(user.lastSignInAt)} />
          <Kv label="Phone" value={user.phone ?? "-"} />
          <Kv label="Updated" value={fmtAbs(user.updatedAt)} />
        </div>
      </section>

      {/* Sessions */}
      <section className="space-y-2">
        <header className="flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            Active sessions {sessions.length > 0 && `· ${sessions.length}`}
          </h3>
        </header>
        {sessionsError ? (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {sessionsError instanceof Error ? sessionsError.message : "Failed."}
          </div>
        ) : sessionsLoading ? (
          <div className="rounded-md border hairline bg-bg-raised px-3 py-2 text-xs text-fg-muted">
            Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <p className="rounded-md border hairline bg-bg-raised px-3 py-2 text-xs text-fg-faint">
            No active sessions.
          </p>
        ) : (
          <ul className="divide-y hairline overflow-hidden rounded-md border hairline bg-bg-raised">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-3 py-2.5">
                <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 text-xs">
                    <span className="font-mono text-fg">
                      {truncate(s.userAgent ?? "unknown", 60)}
                    </span>
                    {s.ip && (
                      <span className="inline-flex items-center gap-1 font-mono text-fg-muted">
                        <Globe className="h-3 w-3" aria-hidden />
                        {s.ip}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 font-mono text-[10px] text-fg-faint">
                    {s.refreshedAt && (
                      <span>refreshed {relativeFromNow(s.refreshedAt)}</span>
                    )}
                    {s.createdAt && (
                      <span>created {relativeFromNow(s.createdAt)}</span>
                    )}
                    {s.notAfter && (
                      <span>expires {relativeFromNow(s.notAfter)}</span>
                    )}
                    {s.factorId && (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <Shield className="h-3 w-3" aria-hidden /> MFA
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revokeOne(s.id)}
                  aria-label="Revoke session"
                >
                  <X className="h-3 w-3" aria-hidden />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Related records */}
      <section className="space-y-2">
        <header className="flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            Related records {related.length > 0 && `· ${related.length} table${related.length === 1 ? "" : "s"}`}
          </h3>
          <span className="text-[10px] text-fg-faint">
            Tables with a user_id / owner_id / created_by column
          </span>
        </header>
        {relatedError ? (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {relatedError instanceof Error ? relatedError.message : "Failed."}
          </div>
        ) : relatedLoading ? (
          <div className="rounded-md border hairline bg-bg-raised px-3 py-2 text-xs text-fg-muted">
            Scanning schema…
          </div>
        ) : related.length === 0 ? (
          <p className="rounded-md border hairline bg-bg-raised px-3 py-2 text-xs text-fg-faint">
            No tables reference this user.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {related.map((r) => (
              <Link
                key={`${r.schema}.${r.table}`}
                href={`/c/${connectionId}/tables/${encodeURIComponent(r.table)}?filter=${encodeURIComponent(`${r.column}.eq.${userId}`)}`}
                className="group flex items-center justify-between gap-3 rounded-md border hairline bg-bg-raised px-3 py-2 transition-colors hover:border-line-strong"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm text-fg">
                    {r.schema}.{r.table}
                  </div>
                  <div className="font-mono text-[10px] text-fg-faint">
                    via {r.column}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-base tabular-nums text-fg">
                    {r.count.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-fg-faint">
                    row{r.count === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Metadata */}
      {(Object.keys(user.userMetadata).length > 0 || Object.keys(user.appMetadata).length > 0) && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <MetadataBlock title="user_metadata" data={user.userMetadata} />
          <MetadataBlock title="app_metadata" data={user.appMetadata} />
        </section>
      )}

      <Dialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
            Delete this user?
          </DialogTitle>
          <DialogDescription>
            This calls Supabase&apos;s admin DELETE on the user. Their data
            in other tables remains unless you have cascading deletes set
            up. This cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onDeleteUser}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-fg-faint uppercase tracking-[0.16em] text-[10px]">{label}</div>
      <div className={cn("truncate font-mono", value ? "text-fg-muted" : "text-fg-faint")}>
        {value ?? "-"}
      </div>
    </div>
  );
}

function MetadataBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  const keys = Object.keys(data);
  return (
    <div className="rounded-md border hairline bg-bg-raised p-3">
      <h4 className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
        {title}
      </h4>
      {keys.length === 0 ? (
        <p className="text-[11px] text-fg-faint">empty</p>
      ) : (
        <ul className="space-y-0.5 font-mono text-[11px]">
          {keys.map((k) => (
            <li key={k} className="grid grid-cols-[8rem_1fr] gap-x-2">
              <span className="truncate text-fg-muted" title={k}>
                {k}
              </span>
              <span className="truncate text-fg" title={String(data[k])}>
                {prettyVal(data[k])}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function fmtAbs(s: string | null): string | null {
  if (!s) return null;
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function prettyVal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  } catch {
    return String(v);
  }
}
