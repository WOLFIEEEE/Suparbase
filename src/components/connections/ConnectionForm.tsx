"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { ServiceRoleWarning } from "@/components/connections/ServiceRoleWarning";
import { AppError } from "@/lib/errors";
import type { ConnectionSummary, KeyRole } from "@/lib/types/connection";

const URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i;
const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

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

async function postConnection(body: { name: string; url: string; key: string }): Promise<ConnectionSummary> {
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
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [serviceWarningOpen, setServiceWarningOpen] = useState(false);

  const urlOk = URL_REGEX.test(url.trim());
  const keyOk = JWT_REGEX.test(key.trim());
  const nameOk = name.trim().length > 0;
  const role = useMemo(() => (keyOk ? decodeRole(key.trim()) : null), [key, keyOk]);
  const canSubmit = urlOk && keyOk && nameOk;

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
    mutation.mutate({ name: name.trim(), url: url.trim(), key: key.trim() });
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

      {error && <ErrorBanner error={error} />}

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
