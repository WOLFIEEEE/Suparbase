"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { AppError } from "@/lib/errors";
import type { AiSettingsSummary } from "@/lib/types/analysis";

async function fetchSettings(): Promise<AiSettingsSummary> {
  const res = await fetch("/api/settings/ai");
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed.");
  }
  return res.json();
}

async function putSettings(body: { key?: string; defaultModel?: string }): Promise<AiSettingsSummary> {
  const res = await fetch("/api/settings/ai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const e = payload as { category?: AppError["category"]; message?: string } | null;
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed.");
  }
  return payload as AiSettingsSummary;
}

async function deleteKey(): Promise<void> {
  const res = await fetch("/api/settings/ai", { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed.");
  }
}

export function AiSettingsForm({ initial }: { initial: AiSettingsSummary }) {
  const qc = useQueryClient();
  const { data = initial } = useQuery({
    queryKey: ["settings", "ai"],
    queryFn: fetchSettings,
    initialData: initial,
    staleTime: 10_000,
  });

  const [keyDraft, setKeyDraft] = useState("");
  const [modelDraft, setModelDraft] = useState(data.defaultModel);
  const [showKey, setShowKey] = useState(false);
  const [formError, setFormError] = useState<AppError | null>(null);

  const saveMutation = useMutation({
    mutationFn: putSettings,
    onSuccess: (next) => {
      setKeyDraft("");
      setModelDraft(next.defaultModel);
      qc.setQueryData(["settings", "ai"], next);
      toast.success("Saved");
    },
    onError: (e) => setFormError(e instanceof AppError ? e : new AppError("client_bug", String((e as Error).message ?? e))),
  });

  const clearMutation = useMutation({
    mutationFn: deleteKey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "ai"] });
      toast.success("OpenRouter key removed.");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const body: { key?: string; defaultModel?: string } = {};
    if (keyDraft.trim().length > 0) body.key = keyDraft.trim();
    if (modelDraft.trim() && modelDraft.trim() !== data.defaultModel) {
      body.defaultModel = modelDraft.trim();
    }
    if (Object.keys(body).length === 0) {
      toast.message("Nothing to save.");
      return;
    }
    saveMutation.mutate(body);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-fg-faint">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
          AI assistance
        </div>
        <h1 className="font-display text-display-md">OpenRouter</h1>
        <p className="text-sm text-fg-muted">
          Your key is AES-256-GCM encrypted at rest. It never leaves the server — all OpenRouter calls
          happen server-side.
        </p>
      </header>

      <form onSubmit={submit} className="surface space-y-5 rounded p-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-key">
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="h-3 w-3" aria-hidden />
                API key
              </span>
            </Label>
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
            id="ai-key"
            type={showKey ? "text" : "password"}
            placeholder={data.hasKey ? "•••••••• key stored" : "sk-or-…"}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-faint">
              Get one at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">openrouter.ai/keys</a>.
            </span>
            {data.hasKey && <Badge tone="accent">key stored</Badge>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai-model">Default model</Label>
          <Input
            id="ai-model"
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            placeholder="anthropic/claude-3.5-haiku"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-fg-faint">
            Any model your OpenRouter account can access. Examples:
            <code className="ml-1 text-fg">anthropic/claude-3.5-haiku</code>,
            <code className="ml-1 text-fg">openai/gpt-4o-mini</code>,
            <code className="ml-1 text-fg">meta-llama/llama-3.1-70b-instruct</code>.
          </p>
        </div>

        {formError && <ErrorBanner error={formError} />}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saveMutation.isPending}>
            <Save className="h-3.5 w-3.5" aria-hidden />
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
          {data.hasKey && (
            <Button
              type="button"
              variant="danger"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove key
            </Button>
          )}
        </div>
      </form>

      <section className="surface space-y-3 rounded p-6">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">Most recent analysis</h2>
        {data.lastAnalysisAt ? (
          <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            <div className="contents">
              <dt className="text-xs uppercase tracking-wider text-fg-muted">Model</dt>
              <dd className="font-mono text-xs">{data.lastAnalysisModel ?? "—"}</dd>
            </div>
            <div className="contents">
              <dt className="text-xs uppercase tracking-wider text-fg-muted">Ran at</dt>
              <dd className="text-xs text-fg-muted">{new Date(data.lastAnalysisAt).toLocaleString()}</dd>
            </div>
            <div className="contents">
              <dt className="text-xs uppercase tracking-wider text-fg-muted">Tokens</dt>
              <dd className="font-mono text-xs">
                {(data.lastTotalTokens ?? 0).toLocaleString()} total ({data.lastPromptTokens ?? 0} in /{" "}
                {data.lastCompletionTokens ?? 0} out)
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-fg-faint">
            No analysis has been run yet. Open a connection — the analysis runs the first time you load the
            dashboard.
          </p>
        )}
      </section>
    </div>
  );
}
