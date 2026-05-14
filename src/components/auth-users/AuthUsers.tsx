"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MailPlus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { relativeFromNow } from "@/lib/ui/time";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { ConnectionSummary } from "@/lib/types/connection";

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

interface ListResult {
  users: AuthUser[];
  total: number | null;
  page: number;
  perPage: number;
}

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

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

async function fetchPage(connectionId: string, page: number): Promise<ListResult> {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/auth-users?page=${page}&per_page=${PAGE_SIZE}`,
  );
  return parse(res);
}

async function invite(connectionId: string, email: string): Promise<AuthUser> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/auth-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "invite", email }),
  });
  return parse(res);
}

async function recover(connectionId: string, uid: string): Promise<{ actionLink: string }> {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/auth-users/${uid}/recovery`,
    { method: "POST" },
  );
  return parse(res);
}

async function patchUser(
  connectionId: string,
  uid: string,
  body: Record<string, unknown>,
): Promise<AuthUser> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/auth-users/${uid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse(res);
}

async function deleteUserApi(connectionId: string, uid: string): Promise<void> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/auth-users/${uid}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as { category?: string; message?: string } | null;
    throw new AppError(
      (e?.category as AppError["category"]) ?? "server",
      e?.message ?? "Delete failed.",
    );
  }
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function AuthUsers({ connection }: { connection: ConnectionSummary }) {
  const isAdmin = connection.role === "service_role";

  if (!isAdmin) {
    return (
      <section className="surface space-y-3 rounded-md p-6">
        <h2 className="flex items-center gap-2 font-display text-base">
          <ShieldAlert className="h-4 w-4 text-warn" aria-hidden /> service_role key required
        </h2>
        <p className="max-w-prose text-xs text-fg-muted">
          The Supabase Admin API (<code>/auth/v1/admin/*</code>) only accepts a
          service_role key. This connection&apos;s stored key is currently{" "}
          <code className="font-mono">{connection.role}</code>, which can read{" "}
          <code>auth.users</code> via PostgREST but can&apos;t invite, reset, ban,
          or delete users.
        </p>
        <p className="text-xs text-fg-muted">
          To enable this page, open this connection&apos;s settings and replace
          the stored key with the service_role key from Supabase Studio →
          Project Settings → API. The key never leaves the server.
        </p>
        <div>
          <Button asChild variant="secondary">
            <a href={`/c/${connection.id}/settings`}>Open connection settings</a>
          </Button>
        </div>
      </section>
    );
  }

  return <AuthUsersAdmin connection={connection} />;
}

function AuthUsersAdmin({ connection }: { connection: ConnectionSummary }) {
  const connectionId = connection.id;
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 200);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery<ListResult>({
    queryKey: ["authUsers", connectionId, page],
    queryFn: () => fetchPage(connectionId, page),
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return listQuery.data?.users ?? [];
    return (listQuery.data?.users ?? []).filter((u) =>
      [u.email, u.phone, u.id, ...Object.values(u.userMetadata).map(String)]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [listQuery.data, debouncedSearch]);

  const inviteMut = useMutation({
    mutationFn: (email: string) => invite(connectionId, email),
    onSuccess: (user) => {
      toast.success(`Invite sent to ${user.email ?? "user"}.`);
      setInviteOpen(false);
      qc.invalidateQueries({ queryKey: ["authUsers", connectionId] });
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  const selected = filtered.find((u) => u.id === selectedId) ?? null;
  const hasMore =
    !!listQuery.data &&
    (listQuery.data.total != null
      ? page * PAGE_SIZE < listQuery.data.total
      : listQuery.data.users.length === PAGE_SIZE);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="surface space-y-3 rounded-md p-4">
        <header className="flex flex-wrap items-center gap-2 border-b hairline pb-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" aria-hidden />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by email, phone, id…"
              className="pl-9 pr-9"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-faint hover:text-fg"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => listQuery.refetch()}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", listQuery.isFetching && "animate-spin")} aria-hidden />
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3 w-3" aria-hidden /> Invite
          </Button>
        </header>

        {listQuery.error ? (
          <ErrorBanner
            error={
              listQuery.error instanceof AppError
                ? listQuery.error
                : new AppError("server", (listQuery.error as Error).message)
            }
          />
        ) : listQuery.isLoading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-fg-muted">
            {debouncedSearch ? "No users matched." : "No users yet: try inviting one."}
          </p>
        ) : (
          <ul className="divide-y hairline">
            {filtered.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                active={u.id === selectedId}
                onSelect={() => setSelectedId(u.id)}
              />
            ))}
          </ul>
        )}

        <footer className="flex items-center justify-between gap-2 border-t hairline pt-3 text-xs text-fg-muted">
          <span>
            page {listQuery.data?.page ?? page}
            {listQuery.data?.total != null && (
              <span className="ml-1 text-fg-faint">
                · {listQuery.data.total.toLocaleString()} total
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page === 1 || listQuery.isFetching}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasMore || listQuery.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>

      <UserDetail
        connectionId={connectionId}
        user={selected}
        onClose={() => setSelectedId(null)}
        onMutated={() => qc.invalidateQueries({ queryKey: ["authUsers", connectionId] })}
      />

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        pending={inviteMut.isPending}
        onSubmit={(email) => inviteMut.mutate(email)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function UserRow({
  user,
  active,
  onSelect,
}: {
  user: AuthUser;
  active: boolean;
  onSelect: () => void;
}) {
  const banned = isBanned(user.bannedUntil);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 px-2 py-2 text-left transition-colors",
          active ? "bg-bg-sunken text-fg" : "text-fg-muted hover:bg-bg-sunken hover:text-fg",
        )}
      >
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-xs",
            banned ? "bg-danger/15 text-danger" : "bg-bg-sunken text-fg-muted",
          )}
        >
          {(user.email ?? user.phone ?? user.id).slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">
            {user.email ?? user.phone ?? user.id}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-fg-faint">
            <span className="truncate font-mono">{user.id.slice(0, 8)}…</span>
            {user.providers.slice(0, 3).map((p) => (
              <span key={p} className="rounded-full bg-bg-raised px-1.5 py-0.5">
                {p}
              </span>
            ))}
          </span>
        </span>
        <span className="hidden shrink-0 text-right text-[10px] text-fg-faint sm:block">
          {user.lastSignInAt ? `seen ${relativeFromNow(user.lastSignInAt)}` : "never seen"}
          {banned && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-danger/10 px-1.5 py-0.5 text-danger">
              <Ban className="h-2.5 w-2.5" aria-hidden /> banned
            </span>
          )}
          {!banned && user.emailConfirmedAt == null && user.email && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-warn/10 px-1.5 py-0.5 text-warn">
              unconfirmed
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function isBanned(bannedUntil: string | null): boolean {
  if (!bannedUntil) return false;
  const t = Date.parse(bannedUntil);
  if (!Number.isFinite(t)) return bannedUntil !== "none";
  return t > Date.now();
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function UserDetail({
  connectionId,
  user,
  onClose,
  onMutated,
}: {
  connectionId: string;
  user: AuthUser | null;
  onClose: () => void;
  onMutated: () => void;
}) {
  const recoveryMut = useMutation({
    mutationFn: () => recover(connectionId, user!.id),
    onSuccess: async (data) => {
      try {
        await navigator.clipboard.writeText(data.actionLink);
        toast.success("Recovery link copied to clipboard.");
      } catch {
        toast.message(`Recovery link: ${data.actionLink}`);
      }
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  const banMut = useMutation({
    mutationFn: (banDuration: string) => patchUser(connectionId, user!.id, { banDuration }),
    onSuccess: (u) => {
      toast.success(isBanned(u.bannedUntil) ? "User banned." : "User unbanned.");
      onMutated();
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteUserApi(connectionId, user!.id),
    onSuccess: () => {
      toast.success("User deleted.");
      onMutated();
      onClose();
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  if (!user) {
    return (
      <aside className="surface space-y-2 rounded-md p-5 text-xs text-fg-muted">
        <p className="font-display text-sm text-fg">No user selected</p>
        <p>Click a user on the left to see their details, send a password recovery email, ban, or delete them.</p>
      </aside>
    );
  }

  const banned = isBanned(user.bannedUntil);

  return (
    <aside className="surface space-y-4 rounded-md p-5 text-xs">
      <header className="space-y-1">
        <h3 className="flex min-w-0 items-center gap-2 font-display text-sm">
          <Mail className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
          <span className="truncate text-fg">{user.email ?? user.phone ?? "user"}</span>
        </h3>
        <p className="truncate font-mono text-[10px] text-fg-faint">{user.id}</p>
      </header>

      <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1.5 text-[11px]">
        <Detail label="Created" value={user.createdAt ? new Date(user.createdAt).toLocaleString() : ":"} />
        <Detail label="Last sign-in" value={user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "never"} />
        <Detail
          label="Email confirmed"
          value={
            user.email == null ? (
              "no email"
            ) : user.emailConfirmedAt ? (
              <span className="inline-flex items-center gap-1 text-accent">
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {new Date(user.emailConfirmedAt).toLocaleDateString()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warn">
                <AlertTriangle className="h-3 w-3" aria-hidden /> unconfirmed
              </span>
            )
          }
        />
        <Detail label="Providers" value={user.providers.length ? user.providers.join(", ") : ":"} />
        <Detail
          label="Status"
          value={
            banned ? (
              <Badge tone="danger">
                <Ban className="h-3 w-3" aria-hidden /> banned
              </Badge>
            ) : (
              <Badge tone="accent">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> active
              </Badge>
            )
          }
        />
      </dl>

      {(Object.keys(user.userMetadata).length > 0 || Object.keys(user.appMetadata).length > 0) && (
        <details className="rounded border hairline bg-bg-sunken/40 px-2.5 py-1.5">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-fg-faint hover:text-fg">
            Metadata
          </summary>
          {Object.keys(user.userMetadata).length > 0 && (
            <pre className="mt-2 max-h-40 overflow-auto rounded surface-sunken p-2 text-[10px] leading-tight">
              {JSON.stringify({ user_metadata: user.userMetadata }, null, 2)}
            </pre>
          )}
          {Object.keys(user.appMetadata).length > 0 && (
            <pre className="mt-2 max-h-40 overflow-auto rounded surface-sunken p-2 text-[10px] leading-tight">
              {JSON.stringify({ app_metadata: user.appMetadata }, null, 2)}
            </pre>
          )}
        </details>
      )}

      <div className="space-y-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="w-full justify-start"
          onClick={() => recoveryMut.mutate()}
          disabled={recoveryMut.isPending || !user.email}
        >
          {recoveryMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <KeyRound className="h-3 w-3" aria-hidden />
          )}
          Generate recovery link
        </Button>
        {user.id && user.email && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              navigator.clipboard.writeText(user.id).catch(() => {});
              toast.success("User id copied.");
            }}
          >
            <Copy className="h-3 w-3" aria-hidden /> Copy user id
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start"
          onClick={() => banMut.mutate(banned ? "none" : "8760h")}
          disabled={banMut.isPending}
        >
          {banMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : banned ? (
            <CheckCircle2 className="h-3 w-3" aria-hidden />
          ) : (
            <Ban className="h-3 w-3 text-danger" aria-hidden />
          )}
          {banned ? "Unban user" : "Ban user (1 year)"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="w-full justify-start"
          onClick={() => {
            if (window.confirm(`Delete ${user.email ?? user.id}? This cannot be undone.`)) {
              deleteMut.mutate();
            }
          }}
          disabled={deleteMut.isPending}
        >
          {deleteMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-3 w-3" aria-hidden />
          )}
          Delete user
        </Button>
      </div>
    </aside>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{value}</dd>
    </div>
  );
}

function InviteDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setEmail("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>Invite a user</DialogTitle>
        <DialogDescription>
          Supabase will email a magic link to confirm and set a password. The
          user appears here once they accept.
        </DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            onSubmit(email.trim());
          }}
          className="space-y-3"
        >
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">Email</span>
            <Input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="font-mono"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !email.trim()}>
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <MailPlus className="h-3 w-3" aria-hidden />
              )}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
