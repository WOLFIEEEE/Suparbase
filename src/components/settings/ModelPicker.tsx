"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Search, Sparkles, Wrench, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength: number | null;
  pricing: { prompt: number | null; completion: number | null };
  modality: string | null;
  supportsTools: boolean;
}

interface ModelsResponse {
  models: OpenRouterModelInfo[];
}

async function fetchModels(): Promise<OpenRouterModelInfo[]> {
  const res = await fetch("/api/settings/ai/models");
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new AppError(
      (json.category as AppError["category"] | undefined) ?? "server",
      (json.message as string | undefined) ?? "Failed to load models.",
    );
  }
  return ((json as unknown) as ModelsResponse).models ?? [];
}

interface Props {
  value: string;
  onChange: (model: string) => void;
  /** Only show models that expose tool-calling. The chat agent needs this. */
  toolsOnly?: boolean;
}

export function ModelPicker({ value, onChange, toolsOnly }: Props) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery<OpenRouterModelInfo[]>({
    queryKey: ["openrouterModels"],
    queryFn: fetchModels,
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (toolsOnly) return data.filter((m) => m.supportsTools);
    return data;
  }, [data, toolsOnly]);

  const selected = useMemo(
    () => (data ?? []).find((m) => m.id === value) ?? null,
    [data, value],
  );

  const grouped = useMemo(() => groupByProvider(filtered), [filtered]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Choose default model"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded border bg-bg-sunken px-3 py-2 text-left text-sm text-fg hairline",
            "transition-colors focus:border-line-strong focus:outline-none focus-visible:ring-1 focus-visible:ring-accent",
            "hover:border-line-strong",
          )}
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            {value || "Pick a model"}
          </span>
          {selected?.supportsTools && (
            <span
              title="Supports tool calling"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-accent"
            >
              <Wrench className="h-2.5 w-2.5" aria-hidden /> tools
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] !p-0"
        sideOffset={6}
      >
        <Command loop>
          <CommandInput placeholder="Search models…" />
          <CommandList className="max-h-80">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 p-6 text-xs text-fg-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Loading OpenRouter models…
              </div>
            )}
            {error && (
              <div className="space-y-2 p-4 text-xs">
                <p className="text-danger">{(error as AppError).message}</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="text-accent hover:underline"
                >
                  Retry
                </button>
              </div>
            )}
            <CommandEmpty>No models matched.</CommandEmpty>
            {grouped.map(({ provider, models }) => (
              <CommandGroup key={provider} heading={provider}>
                {models.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.id} ${m.name}`}
                    onSelect={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5 shrink-0",
                        value === m.id ? "text-accent" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{m.name}</span>
                      <span className="block truncate font-mono text-[10px] text-fg-faint">
                        {m.id}
                      </span>
                    </span>
                    <span className="ml-2 flex shrink-0 items-center gap-1 text-[10px] text-fg-faint">
                      {m.contextLength != null && (
                        <span title="Context window">
                          {formatContext(m.contextLength)}
                        </span>
                      )}
                      {m.pricing.prompt != null && m.pricing.completion != null && (
                        <span
                          title={`Input $${m.pricing.prompt} / 1k · Output $${m.pricing.completion} / 1k`}
                        >
                          {formatPricing(m.pricing.prompt, m.pricing.completion)}
                        </span>
                      )}
                      {m.supportsTools && (
                        <Wrench className="h-2.5 w-2.5 text-accent" aria-hidden />
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t hairline px-3 py-2 text-[10px] text-fg-faint">
            <span className="inline-flex items-center gap-1">
              <Search className="h-3 w-3" aria-hidden /> {(data ?? []).length} models
              {toolsOnly && filtered.length < (data ?? []).length && (
                <span className="ml-1 text-accent">
                  <Sparkles className="inline h-3 w-3" aria-hidden /> tool-capable only
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center gap-1 hover:text-fg"
            >
              <X className="h-3 w-3" aria-hidden /> Clear
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ProviderGroup {
  provider: string;
  models: OpenRouterModelInfo[];
}

function groupByProvider(models: OpenRouterModelInfo[]): ProviderGroup[] {
  const map = new Map<string, OpenRouterModelInfo[]>();
  for (const m of models) {
    const slash = m.id.indexOf("/");
    const provider = slash >= 0 ? m.id.slice(0, slash) : "other";
    const list = map.get(provider) ?? [];
    list.push(m);
    map.set(provider, list);
  }
  return Array.from(map.entries())
    .map(([provider, list]) => ({ provider, models: list }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ctx`;
  if (n >= 1000) return `${Math.round(n / 1000)}k ctx`;
  return `${n} ctx`;
}

function formatPricing(prompt: number, completion: number): string {
  const fmt = (per: number) => {
    // OpenRouter prices are USD per token; convert to per-1M for readability.
    const perM = per * 1_000_000;
    if (perM === 0) return "free";
    if (perM < 1) return `$${perM.toFixed(2)}/M`;
    return `$${perM.toFixed(1)}/M`;
  };
  return `${fmt(prompt)} → ${fmt(completion)}`;
}
