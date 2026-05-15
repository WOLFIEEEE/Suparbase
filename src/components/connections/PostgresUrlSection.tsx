"use client";

/**
 * Settings-page section for the optional direct Postgres URL. Same
 * encrypted blob the RLS debugger / SQL playground / impersonation
 * pages read. Surfaces set / replace / clear without forcing the user
 * to find a deep-linked nudge in a feature page.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Eye, EyeOff, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AppError } from "@/lib/errors";
import type { ConnectionSummary } from "@/lib/types/connection";

const PG_URL_REGEX = /^postgres(?:ql)?:\/\/.+/i;

async function setUrl(connectionId: string, url: string | null): Promise<ConnectionSummary> {
  const res = await fetch(`/api/connections/${encodeURIComponent(connectionId)}/postgres-url`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new AppError(
      (json.category as AppError["category"] | undefined) ?? "server",
      (json.message as string | undefined) ?? "Failed to save URL.",
    );
  }
  return json as unknown as ConnectionSummary;
}

interface Props {
  connection: ConnectionSummary;
}

export function PostgresUrlSection({ connection }: Props) {
  const qc = useQueryClient();
  const [url, setVal] = useState("");
  const [showVal, setShowVal] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => setUrl(connection.id, url.trim()),
    onSuccess: () => {
      toast.success("Direct Postgres URL saved.");
      setVal("");
      qc.invalidateQueries({ queryKey: ["connection", connection.id] });
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () => setUrl(connection.id, null),
    onSuccess: () => {
      toast.success("Direct Postgres URL cleared.");
      qc.invalidateQueries({ queryKey: ["connection", connection.id] });
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  const trimmed = url.trim();
  const valid = trimmed.length === 0 || PG_URL_REGEX.test(trimmed);
  const canSave = trimmed.length > 0 && valid && !saveMut.isPending;

  return (
    <section className="surface space-y-4 rounded-md p-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            Direct Postgres URL
          </h2>
          {connection.hasPostgresUrl ? (
            <Badge tone="accent">
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3" aria-hidden /> configured
              </span>
            </Badge>
          ) : (
            <Badge>not set</Badge>
          )}
        </div>
        <p className="max-w-prose text-xs text-fg-muted">
          The direct Postgres connection string (
          <code className="font-mono">postgres://...</code>). Unlocks the{" "}
          <strong className="text-fg">RLS debugger</strong>, the{" "}
          <strong className="text-fg">SQL playground</strong>, and the{" "}
          <strong className="text-fg">per-user sessions inspector</strong> on
          the auth-users page. Encrypted at rest with the same AES-256-GCM
          vault as your API key; never reaches the browser.
        </p>
      </header>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) saveMut.mutate();
        }}
      >
        <div className="flex items-center justify-between">
          <Label htmlFor="conn-pg-url-settings" className="text-xs">
            {connection.hasPostgresUrl ? "Replace URL" : "Set URL"}
          </Label>
          <button
            type="button"
            onClick={() => setShowVal((s) => !s)}
            className="text-xs text-fg-muted hover:text-fg"
            aria-pressed={showVal}
          >
            {showVal ? (
              <span className="inline-flex items-center gap-1">
                <EyeOff className="h-3 w-3" /> hide
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" /> show
              </span>
            )}
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="conn-pg-url-settings"
            type={showVal ? "text" : "password"}
            placeholder="postgresql://postgres:password@db.abcdefgh.supabase.co:5432/postgres"
            value={url}
            onChange={(e) => setVal(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono !text-xs"
            aria-invalid={trimmed.length > 0 && !valid}
          />
          <Button type="submit" disabled={!canSave}>
            {saveMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            )}
            Save
          </Button>
        </div>
        {trimmed.length > 0 && !valid && (
          <p className="text-[11px] text-danger">
            Must start with <code className="font-mono">postgres://</code> or{" "}
            <code className="font-mono">postgresql://</code>.
          </p>
        )}
        <p className="text-[10px] leading-relaxed text-fg-faint">
          Find it in <strong className="text-fg-muted">Project Settings →
          Database → Connection string</strong> on Supabase. Use a Postgres
          role with the minimum privileges your features need (
          <code>SELECT</code> on <code>pg_policies</code>,{" "}
          <code>auth.sessions</code>, etc.).
        </p>
      </form>

      {connection.hasPostgresUrl && (
        <div className="flex items-center justify-between border-t hairline pt-3 text-xs">
          <p className="text-fg-faint">
            Clearing the URL disables the RLS debugger, SQL playground, and
            sessions inspector until you set a new one.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Clear the direct Postgres URL?")) clearMut.mutate();
            }}
            disabled={clearMut.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        </div>
      )}
    </section>
  );
}
