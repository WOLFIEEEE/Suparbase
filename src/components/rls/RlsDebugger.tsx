"use client";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ExternalLink,
  Loader2,
  Lock,
  Play,
  Save,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { ConnectionSummary } from "@/lib/types/connection";

interface Policy {
  schema: string;
  table: string;
  policy: string;
  command: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  permissive: boolean;
  roles: string[];
  using: string | null;
  check: string | null;
}

interface RlsStatus {
  table: string;
  rlsEnabled: boolean;
  policyCount: number;
}

interface PoliciesResponse {
  policies: Policy[];
  status: RlsStatus[];
}

type SimRole = "anon" | "authenticated" | "service_role";

interface SimResult {
  verb: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  allowed: boolean;
  rowsVisible?: number;
  message?: string;
}

interface Props {
  connection: ConnectionSummary;
}

async function fetchPolicies(connectionId: string): Promise<PoliciesResponse> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/rls/policies`);
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new AppError(
      (json.category as AppError["category"] | undefined) ?? "server",
      (json.message as string | undefined) ?? "Failed to load policies.",
    );
  }
  return json as unknown as PoliciesResponse;
}

async function simulate(connectionId: string, table: string, role: SimRole, claimsJson: string): Promise<SimResult[]> {
  let claims: Record<string, unknown> | undefined;
  if (claimsJson.trim()) {
    try {
      claims = JSON.parse(claimsJson) as Record<string, unknown>;
    } catch {
      throw new AppError("validation", "Claims must be valid JSON.");
    }
  }
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/rls/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, role, claims }),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new AppError(
      (json.category as AppError["category"] | undefined) ?? "server",
      (json.message as string | undefined) ?? "Simulation failed.",
    );
  }
  return (json as { results: SimResult[] }).results;
}

async function savePostgresUrl(connectionId: string, url: string | null): Promise<ConnectionSummary> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/postgres-url`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new AppError(
      (json.category as AppError["category"] | undefined) ?? "server",
      (json.message as string | undefined) ?? "Failed to save URL.",
    );
  }
  return json as unknown as ConnectionSummary;
}

export function RlsDebugger({ connection }: Props) {
  const qc = useQueryClient();
  const [hasUrl, setHasUrl] = useState(connection.hasPostgresUrl);

  if (!hasUrl) {
    return (
      <PostgresUrlSetup
        connectionId={connection.id}
        onSaved={() => {
          setHasUrl(true);
          qc.invalidateQueries({ queryKey: ["rlsPolicies", connection.id] });
        }}
      />
    );
  }

  return (
    <RlsBody
      connection={connection}
      onUrlCleared={() => {
        setHasUrl(false);
      }}
    />
  );
}

function PostgresUrlSetup({
  connectionId,
  onSaved,
}: {
  connectionId: string;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState("");
  const mutation = useMutation({
    mutationFn: (next: string) => savePostgresUrl(connectionId, next),
    onSuccess: () => {
      toast.success("Direct Postgres URL saved.");
      onSaved();
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  return (
    <section className="surface rounded-md p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <ShieldAlert className="h-4 w-4 text-warn" aria-hidden /> RLS debugger needs a direct
            Postgres URL
          </h2>
          <p className="max-w-prose text-xs text-fg-muted">
            PostgREST hides the policy catalog from anon/authenticated keys, so the
            debugger talks to Postgres directly. Paste your project&apos;s direct
            connection string below. We encrypt it with the same vault key that
            stores your service_role key. It&apos;s used <em>only</em> for the RLS
            page — nothing else in Suparbase reads it.
          </p>
        </div>
        <a
          href="https://supabase.com/docs/guides/database/connecting-to-postgres"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          where to find it <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return;
          mutation.mutate(url.trim());
        }}
      >
        <Input
          type="password"
          placeholder="postgres://postgres:[password]@db.<project>.supabase.co:5432/postgres"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="font-mono"
          autoComplete="off"
        />
        <Button type="submit" disabled={mutation.isPending || !url.trim()}>
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save URL
        </Button>
      </form>
      <p className="mt-2 text-[10px] text-fg-faint">
        Strongly recommended: use a Postgres role with <code>SELECT</code> on{" "}
        <code>pg_policies</code> and <code>pg_class</code> only.
      </p>
    </section>
  );
}

function RlsBody({
  connection,
  onUrlCleared,
}: {
  connection: ConnectionSummary;
  onUrlCleared: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<PoliciesResponse>({
    queryKey: ["rlsPolicies", connection.id],
    queryFn: () => fetchPolicies(connection.id),
    staleTime: 30_000,
  });

  const clearUrl = useMutation({
    mutationFn: () => savePostgresUrl(connection.id, null),
    onSuccess: () => {
      toast.success("Postgres URL cleared.");
      qc.removeQueries({ queryKey: ["rlsPolicies", connection.id] });
      onUrlCleared();
    },
  });

  const grouped = useMemo(() => groupByTable(data?.policies ?? [], data?.status ?? []), [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-fg-faint">
          Direct Postgres URL configured · used only on this page.
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clearUrl.mutate()}
          disabled={clearUrl.isPending}
        >
          <X className="h-3 w-3" aria-hidden /> Clear stored URL
        </Button>
      </div>

      {error ? (
        <ErrorBanner
          error={
            error instanceof AppError
              ? error
              : new AppError("server", (error as Error).message ?? "Failed to load policies.")
          }
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <PoliciesList
          isLoading={isLoading}
          grouped={grouped}
          refetch={() => {
            void refetch();
          }}
        />
        <Simulator
          connection={connection}
          tables={grouped.map((g) => g.table)}
        />
      </div>
    </div>
  );
}

interface GroupedEntry {
  table: string;
  rlsEnabled: boolean;
  policies: Policy[];
}

function groupByTable(policies: Policy[], status: RlsStatus[]): GroupedEntry[] {
  const map = new Map<string, GroupedEntry>();
  for (const s of status) {
    map.set(s.table, { table: s.table, rlsEnabled: s.rlsEnabled, policies: [] });
  }
  for (const p of policies) {
    let entry = map.get(p.table);
    if (!entry) {
      entry = { table: p.table, rlsEnabled: false, policies: [] };
      map.set(p.table, entry);
    }
    entry.policies.push(p);
  }
  return Array.from(map.values()).sort((a, b) => a.table.localeCompare(b.table));
}

function PoliciesList({
  isLoading,
  grouped,
  refetch,
}: {
  isLoading: boolean;
  grouped: GroupedEntry[];
  refetch: () => void;
}) {
  return (
    <section className="surface space-y-4 rounded-md p-5">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base">Policies</h3>
        <Button variant="ghost" size="sm" onClick={refetch}>
          Refresh
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : grouped.length === 0 ? (
        <p className="text-xs text-fg-muted">No tables in the public schema.</p>
      ) : (
        <ul className="space-y-3">
          {grouped.map((g) => (
            <TableBlock key={g.table} entry={g} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TableBlock({ entry }: { entry: GroupedEntry }) {
  return (
    <li className="rounded border hairline bg-bg-raised/40">
      <header className="flex items-center justify-between gap-2 border-b hairline px-3 py-2">
        <span className="flex items-center gap-2">
          {entry.rlsEnabled ? (
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
          ) : (
            <Unlock className="h-3.5 w-3.5 text-warn" aria-hidden />
          )}
          <span className="font-mono text-sm">{entry.table}</span>
          {!entry.rlsEnabled && (
            <Badge tone="warn">
              RLS off
            </Badge>
          )}
          <span className="text-[10px] text-fg-faint tabular-nums">
            {entry.policies.length} {entry.policies.length === 1 ? "policy" : "policies"}
          </span>
        </span>
      </header>
      {entry.policies.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-fg-faint">No policies.</p>
      ) : (
        <ul className="divide-y hairline">
          {entry.policies.map((p) => (
            <PolicyRow key={`${p.table}.${p.policy}`} policy={p} />
          ))}
        </ul>
      )}
    </li>
  );
}

const VERB_TONE: Record<Policy["command"], string> = {
  ALL: "bg-accent/10 text-accent",
  SELECT: "bg-accent/10 text-accent",
  INSERT: "bg-accent/10 text-accent",
  UPDATE: "bg-warn/10 text-warn",
  DELETE: "bg-danger/10 text-danger",
};

function PolicyRow({ policy }: { policy: Policy }) {
  return (
    <li className="space-y-1 px-3 py-2 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
            VERB_TONE[policy.command],
          )}
        >
          {policy.command}
        </span>
        <span className="font-mono text-fg">{policy.policy}</span>
        {!policy.permissive && (
          <Badge tone="danger" className="!normal-case">
            RESTRICTIVE
          </Badge>
        )}
        <span className="ml-auto truncate font-mono text-[10px] text-fg-faint">
          {policy.roles.join(", ") || "public"}
        </span>
      </div>
      {policy.using && (
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">USING</p>
          <pre className="overflow-x-auto rounded surface-sunken p-2 font-mono text-[11px]">
            {policy.using}
          </pre>
        </div>
      )}
      {policy.check && (
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">WITH CHECK</p>
          <pre className="overflow-x-auto rounded surface-sunken p-2 font-mono text-[11px]">
            {policy.check}
          </pre>
        </div>
      )}
    </li>
  );
}

function Simulator({
  connection,
  tables,
}: {
  connection: ConnectionSummary;
  tables: string[];
}) {
  const [table, setTable] = useState<string>(tables[0] ?? "");
  const [role, setRole] = useState<SimRole>("authenticated");
  const [claimsJson, setClaimsJson] = useState<string>(
    JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000", role: "authenticated" }, null, 2),
  );

  const mutation = useMutation<SimResult[], AppError>({
    mutationFn: () => simulate(connection.id, table, role, claimsJson),
    onError: (e) => toast.error(e.message),
  });

  const run = useCallback(() => {
    if (!table) {
      toast.error("Pick a table first.");
      return;
    }
    mutation.mutate();
  }, [mutation, table]);

  return (
    <aside className="surface space-y-4 rounded-md p-5">
      <header>
        <h3 className="font-display text-base">Simulate a request</h3>
        <p className="mt-0.5 text-[11px] text-fg-faint">
          Runs SELECT / INSERT / UPDATE / DELETE inside a transaction that
          always rolls back. No row data is modified.
        </p>
      </header>

      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">Table</span>
          <select
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="w-full rounded border hairline bg-bg-raised px-2 py-1.5 text-xs"
          >
            {tables.length === 0 && <option value="">— no tables —</option>}
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">Role</span>
          <div className="flex gap-1">
            {(["anon", "authenticated", "service_role"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "flex-1 rounded border hairline px-2 py-1 text-[11px]",
                  role === r ? "border-accent/60 bg-accent/10 text-accent" : "text-fg-muted hover:bg-bg-sunken",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
            request.jwt.claims (JSON)
          </span>
          <Textarea
            rows={5}
            value={claimsJson}
            onChange={(e) => setClaimsJson(e.target.value)}
            className="text-[11px]"
            placeholder='{"sub": "...", "role": "authenticated"}'
          />
        </label>

        <Button onClick={run} disabled={mutation.isPending || !table} className="w-full">
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden />
          )}
          Run simulation
        </Button>
      </div>

      {mutation.data && (
        <ul className="space-y-1.5">
          {mutation.data.map((r) => (
            <li
              key={r.verb}
              className={cn(
                "flex items-start gap-2 rounded border px-2.5 py-1.5 text-[11px]",
                r.allowed ? "border-accent/40 bg-accent/5" : "border-danger/40 bg-danger/5",
              )}
            >
              {r.allowed ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
              ) : (
                <Lock className="mt-0.5 h-3 w-3 shrink-0 text-danger" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="font-mono">{r.verb}</span>
                {r.rowsVisible != null && (
                  <span className="ml-2 text-fg-muted">
                    sees {r.rowsVisible.toLocaleString()} {r.rowsVisible === 1 ? "row" : "rows"}
                  </span>
                )}
                {r.message && (
                  <span className="ml-2 truncate text-fg-faint">{r.message}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
