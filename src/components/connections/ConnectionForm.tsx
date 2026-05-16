"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, ChevronRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { ServiceRoleWarning } from "@/components/connections/ServiceRoleWarning";
import { PaywallCard } from "@/components/billing/PaywallCard";
import { AppError } from "@/lib/errors";
import type { ConnectionSummary, KeyRole } from "@/lib/types/connection";

const URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i;
const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PG_URL_REGEX = /^postgres(?:ql)?:\/\/.+/i;

function decodeRole(key: string): KeyRole {
  const parts = key.split(".");
  if (parts.length !== 3) return "unknown";
  const seg = parts[1] ?? "";
  const padded = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  try {
    const json = atob(padded + pad);
    const payload = JSON.parse(json) as { role?: string };
    if (payload.role === "anon" || payload.role === "authenticated" || payload.role === "service_role") {
      return payload.role;
    }
  } catch {
    /* fall through */
  }
  return "unknown";
}

async function postConnection(body: {
  name: string;
  url: string;
  key: string;
  postgresUrl: string | null;
}): Promise<ConnectionSummary> {
  const res = await fetch("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const e = payload as { category?: AppError["category"]; message?: string; field?: string } | null;
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed.", {
      columnHint: e?.field,
    });
  }
  return payload as ConnectionSummary;
}

export function ConnectionForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [postgresUrl, setPostgresUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showPgUrl, setShowPgUrl] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [serviceWarningOpen, setServiceWarningOpen] = useState(false);

  const urlOk = URL_REGEX.test(url.trim());
  const keyOk = JWT_REGEX.test(key.trim());
  const nameOk = name.trim().length > 0;
  const pgTrim = postgresUrl.trim();
  const pgOk = pgTrim.length === 0 || PG_URL_REGEX.test(pgTrim);
  const role = useMemo(() => (keyOk ? decodeRole(key.trim()) : null), [key, keyOk]);
  const canSubmit = urlOk && keyOk && nameOk && pgOk;

  const mutation = useMutation({
    mutationFn: postConnection,
    onSuccess: (summary) => {
      qc.invalidateQueries({ queryKey: ["connections"] });
      router.push(`/c/${summary.id}`);
    },
    onError: (e) => {
      setError(e instanceof AppError ? e : new AppError("client_bug", String((e as Error).message ?? e)));
    },
  });

  function submit() {
    setError(null);
    mutation.mutate({
      name: name.trim(),
      url: url.trim(),
      key: key.trim(),
      postgresUrl: pgTrim.length > 0 ? pgTrim : null,
    });
  }

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (role === "service_role") {
      setServiceWarningOpen(true);
      return;
    }
    submit();
  }

  return (
    <form onSubmit={onFormSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="conn-name">Display name</Label>
        <Input
          id="conn-name"
          placeholder="my-app prod"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoFocus
          autoComplete="off"
        />
        <p className="text-xs text-fg-faint">A label only you will see.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="conn-url">Project URL</Label>
        <Input
          id="conn-url"
          placeholder="https://abcdefgh.supabase.co"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="url"
          inputMode="url"
          aria-invalid={url.length > 0 && !urlOk}
          aria-describedby="conn-url-help"
        />
        <p id="conn-url-help" className="text-xs text-fg-faint">
          {url.length > 0 && !urlOk
            ? "URL must point to a *.supabase.co project (https only)."
            : "Project Settings → API → Project URL"}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="conn-key">API key</Label>
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            className="text-xs text-fg-muted hover:text-fg"
            aria-pressed={showKey}
          >
            {showKey ? (
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
        <Input
          id="conn-key"
          type={showKey ? "text" : "password"}
          placeholder="eyJhbGciOi…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={key.length > 0 && !keyOk}
          aria-describedby="conn-key-help"
        />
        <div id="conn-key-help" className="flex items-center justify-between text-xs">
          <span className="text-fg-faint">
            {key.length > 0 && !keyOk
              ? "API key must be a JWT."
              : "anon key recommended. The key is encrypted at rest on submission."}
          </span>
          {role && (
            <Badge tone={role === "service_role" ? "danger" : role === "unknown" ? "warn" : "accent"}>
              {role.replace("_", "-")}
            </Badge>
          )}
        </div>
      </div>

      <div className="rounded-md border hairline bg-bg-sunken/40">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:text-fg"
          aria-expanded={advancedOpen}
        >
          {advancedOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span className="font-medium text-fg">Direct Postgres URL</span>
          <span className="ml-1 text-xs text-fg-faint">optional · unlocks RLS / SQL / sessions</span>
        </button>
        {advancedOpen && (
          <div className="space-y-2 border-t hairline px-3 py-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="conn-pg-url" className="text-xs">
                postgres:// connection string
              </Label>
              <button
                type="button"
                onClick={() => setShowPgUrl((s) => !s)}
                className="text-xs text-fg-muted hover:text-fg"
                aria-pressed={showPgUrl}
              >
                {showPgUrl ? (
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
            <Input
              id="conn-pg-url"
              type={showPgUrl ? "text" : "password"}
              placeholder="postgresql://postgres:password@db.abcdefgh.supabase.co:5432/postgres"
              value={postgresUrl}
              onChange={(e) => setPostgresUrl(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono !text-xs"
              aria-invalid={postgresUrl.length > 0 && !pgOk}
              aria-describedby="conn-pg-url-help"
            />
            <p id="conn-pg-url-help" className="text-[11px] leading-relaxed text-fg-faint">
              {postgresUrl.length > 0 && !pgOk ? (
                <span className="text-danger">
                  Must start with <code className="font-mono">postgres://</code> or{" "}
                  <code className="font-mono">postgresql://</code>.
                </span>
              ) : (
                <>
                  Find this in <strong className="text-fg">Project Settings → Database → Connection
                  string</strong>. Encrypted at rest with the same AES-256-GCM
                  vault as the API key. Required for the RLS debugger, SQL
                  playground, and the per-user sessions inspector, you can
                  also add it later from connection settings.
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {error && error.category === "plan_limit" ? (
        <PaywallCard
          title="Free plan: 1 connection"
          message={error.message}
        />
      ) : error ? (
        <ErrorBanner error={error} />
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending ? (
            <>
              <span className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent-fg" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              Create connection <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </Button>
      </div>

      <ServiceRoleWarning
        open={serviceWarningOpen}
        onCancel={() => setServiceWarningOpen(false)}
        onConfirm={() => {
          setServiceWarningOpen(false);
          submit();
        }}
      />
    </form>
  );
}
