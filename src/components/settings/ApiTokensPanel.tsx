"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { relativeFromNow } from "@/lib/ui/time";
import { cn } from "@/lib/ui/cn";

interface Token {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

async function fetchTokens(): Promise<{ tokens: Token[]; max: number }> {
  const res = await fetch("/api/account/api-tokens");
  if (!res.ok) throw new Error("Could not load tokens.");
  return (await res.json()) as { tokens: Token[]; max: number };
}

const EXPIRY_OPTIONS = [
  { days: 0, label: "Never" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

/**
 * Personal API tokens: mint (plaintext shown once), list, revoke. Tokens
 * authenticate the read-only /api/public/v1 surface.
 */
export function ApiTokensPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["api-tokens"], queryFn: fetchTokens });
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [fresh, setFresh] = useState<{ name: string; plaintext: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<Token | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/account/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), expiresInDays }),
      });
      const json = (await res.json().catch(() => null)) as { message?: string; plaintext?: string } | null;
      if (!res.ok || !json?.plaintext) throw new Error(json?.message ?? "Could not create the token.");
      return json.plaintext;
    },
    onSuccess: (plaintext) => {
      setFresh({ name: name.trim(), plaintext });
      setName("");
      setCopied(false);
      void qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/account/api-tokens/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not revoke the token.");
    },
    onSuccess: () => {
      toast.success("Token revoked");
      void qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tokens = data?.tokens ?? [];
  const active = tokens.filter((t) => !t.revokedAt).length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">API tokens</h1>
        <p className="text-sm text-fg-muted">
          Script against your workspace with the read-only public API. Tokens carry your own access (every connection
          you own or are a member of) and can be revoked at any time. See the{" "}
          <Link href="/docs/api" className="text-accent hover:underline">API reference</Link>.
        </p>
      </header>

      {fresh && (
        <section className="space-y-3 rounded-md border border-accent/50 bg-accent/5 p-5">
          <h2 className="text-sm font-medium">Copy your new token now</h2>
          <p className="text-xs text-fg-muted">
            This is the only time <strong className="text-fg">{fresh.name}</strong> is shown in full. Store it in a
            secret manager; anyone holding it can read your data.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border hairline bg-bg-sunken px-3 py-2 font-mono text-xs">
              {fresh.plaintext}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fresh.plaintext);
                  setCopied(true);
                } catch {
                  toast.error("Clipboard is not available.");
                }
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded border hairline bg-bg-sunken px-3 py-2 font-mono text-[11px] text-fg-muted">
{`curl -H "Authorization: Bearer ${fresh.plaintext}" ${typeof window !== "undefined" ? window.location.origin : ""}/api/public/v1/connections`}
          </pre>
          <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>
            I&apos;ve saved it
          </Button>
        </section>
      )}

      <section className="surface space-y-4 rounded-md p-6">
        <header className="space-y-1">
          <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            <KeyRound className="h-3 w-3" aria-hidden /> New token
          </h2>
          <p className="text-xs text-fg-muted">
            {active} of {data?.max ?? 20} active tokens in use.
          </p>
        </header>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || create.isPending) return;
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="token-name">Name</Label>
            <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="CI export script" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="token-expiry">Expires</Label>
            <select
              id="token-expiry"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="h-10 rounded border hairline bg-bg-raised px-3 text-sm"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create token"}
          </Button>
        </form>
      </section>

      <section className="space-y-2">
        {isLoading ? (
          <p className="text-xs text-fg-muted">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="surface rounded-md p-6 text-sm text-fg-muted">No tokens yet.</p>
        ) : (
          tokens.map((t) => {
            const expired = !!t.expiresAt && new Date(t.expiresAt).getTime() < Date.now();
            const dead = !!t.revokedAt || expired;
            return (
              <article key={t.id} className={cn("surface flex items-center gap-3 rounded-md p-4", dead && "opacity-60")}>
                <KeyRound className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{t.name}</span>
                    <code className="font-mono text-[11px] text-fg-faint">{t.prefix}…</code>
                    {t.revokedAt ? <Badge tone="danger">revoked</Badge> : expired ? <Badge tone="warn">expired</Badge> : <Badge tone="accent">read</Badge>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-fg-faint">
                    created {relativeFromNow(t.createdAt)}
                    {t.lastUsedAt ? ` · last used ${relativeFromNow(t.lastUsedAt)}` : " · never used"}
                    {t.expiresAt && !t.revokedAt ? ` · ${expired ? "expired" : "expires"} ${relativeFromNow(t.expiresAt) ?? new Date(t.expiresAt).toLocaleDateString()}` : ""}
                  </div>
                </div>
                {!t.revokedAt && (
                  <button
                    type="button"
                    onClick={() => setRevoking(t)}
                    aria-label={`Revoke token ${t.name}`}
                    className="shrink-0 rounded p-1 text-fg-faint hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </article>
            );
          })
        )}
      </section>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke this token?"
        description={revoking ? `Scripts using "${revoking.name}" will start getting 401 immediately. This cannot be undone.` : undefined}
        confirmLabel="Revoke"
        tone="danger"
        onConfirm={async () => {
          if (revoking) await revoke.mutateAsync(revoking.id);
        }}
      />
    </div>
  );
}
