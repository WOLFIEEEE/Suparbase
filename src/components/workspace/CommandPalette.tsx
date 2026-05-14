"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Database,
  FileText,
  Home,
  Kanban,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShoppingCart,
  SunMoon,
  Sparkles,
  Table2,
  Users as UsersIcon,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { encodePkSegment } from "@/lib/table/pk";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useSchema } from "@/lib/api/hooks";
import { useAnalysis, analysisOrNull } from "@/hooks/useAnalysis";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";
import { writeThemeCookie } from "@/lib/theme/cookie";
import { isSystemTable, categoryOf } from "@/lib/presets/groupTables";
import type { ConnectionSummary } from "@/lib/types/connection";
import type { AiSettingsSummary, TableCategory } from "@/lib/types/analysis";
import { AppError } from "@/lib/errors";

async function fetchConnections(): Promise<ConnectionSummary[]> {
  const res = await fetch("/api/connections");
  if (!res.ok) throw new AppError("server", "Failed to load connections.");
  return res.json();
}

async function fetchAiSettings(): Promise<AiSettingsSummary> {
  const res = await fetch("/api/settings/ai");
  if (!res.ok) throw new AppError("server", "Failed to load AI settings.");
  return res.json();
}

interface SearchHit {
  table: string;
  schema: string;
  primaryKey: Record<string, unknown>;
  matchedColumn: string;
  snippet: string;
}

async function searchRowsApi(connectionId: string, q: string): Promise<SearchHit[]> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Search failed.");
  }
  const data = (await res.json()) as { hits: SearchHit[] };
  return data.hits ?? [];
}

const CATEGORY_ICON: Record<TableCategory, typeof UsersIcon> = {
  users: UsersIcon,
  content: FileText,
  logs: Activity,
  commerce: ShoppingCart,
  tasks: Kanban,
  messages: MessageSquare,
  generic: Table2,
};

function toggleHtmlTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const html = document.documentElement;
  const current = html.dataset.theme === "light" ? "light" : "dark";
  const next: "light" | "dark" = current === "light" ? "dark" : "light";
  html.dataset.theme = next;
  writeThemeCookie(next);
  return next;
}

export function CommandPalette() {
  const router = useRouter();
  const connection = useCurrentConnection();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Global hotkey: Cmd/Ctrl+K toggles the palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Data is lazily fetched once the palette is opened. React-query will
  // typically have the schema/analysis already cached from the layout.
  const { data: schema, isLoading: schemaLoading } = useSchema(open ? connection.id : undefined);
  const { data: cached } = useAnalysis(open ? connection.id : undefined);
  const analyses = analysisOrNull(cached)?.tables;
  const { data: connections, isLoading: connectionsLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: fetchConnections,
    enabled: open,
    staleTime: 60_000,
  });
  const { data: aiSettings } = useQuery({
    queryKey: ["settings", "ai"],
    queryFn: fetchAiSettings,
    enabled: open,
    staleTime: 60_000,
  });

  // Global row search: kicks in once the query is 2+ chars. Server scans
  // text/uuid/int columns of every table in parallel.
  const debouncedQuery = useDebouncedValue(query, 300);
  const searchActive = open && debouncedQuery.trim().length >= 2;
  const { data: searchHits, isFetching: searchFetching } = useQuery<SearchHit[]>({
    queryKey: ["rowSearch", connection.id, debouncedQuery],
    queryFn: () => searchRowsApi(connection.id, debouncedQuery.trim()),
    enabled: searchActive,
    staleTime: 30_000,
    retry: false,
  });

  const tables = useMemo(() => {
    const all = schema?.tables ?? [];
    return all
      .filter((t) => !isSystemTable(t))
      .map((t) => ({
        table: t,
        category: categoryOf(t, analyses),
        displayName: analyses?.find((a) => a.schema === t.schema && a.name === t.name)?.displayName ?? t.name,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [schema, analyses]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" hideClose>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to a table, switch connections, or run a global action.
        </DialogDescription>
        <Command shouldFilter loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Jump to a table, connection, or action…"
            aria-label="Command palette search"
          />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>

            <CommandGroup heading="Pages">
              <CommandItem
                value={`dashboard ${connection.name}`}
                onSelect={() => navigate(`/c/${connection.id}`)}
              >
                <Home className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                Dashboard
                <span className="ml-auto text-[10px] text-fg-faint">{connection.name}</span>
              </CommandItem>
              <CommandItem
                value="all tables"
                onSelect={() => navigate(`/c/${connection.id}/tables`)}
              >
                <Table2 className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                All tables
              </CommandItem>
              <CommandItem
                value="schema"
                onSelect={() => navigate(`/c/${connection.id}/schema`)}
              >
                <Database className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                Schema
              </CommandItem>
            </CommandGroup>

            {searchActive && (
              <CommandGroup
                heading={
                  <span className="inline-flex items-center gap-1.5">
                    <Search className="h-3 w-3" aria-hidden />
                    Rows matching &ldquo;{debouncedQuery.trim()}&rdquo;
                    {searchFetching && (
                      <Loader2 className="ml-1 h-3 w-3 animate-spin text-accent" aria-hidden />
                    )}
                  </span>
                }
              >
                {!searchHits && searchFetching ? (
                  <CommandItem disabled value="__search_loading" forceMount>
                    <Search className="mr-2 h-4 w-4 text-fg-faint" aria-hidden />
                    <span className="text-fg-faint">Searching every table…</span>
                  </CommandItem>
                ) : searchHits && searchHits.length === 0 ? (
                  <CommandItem disabled value="__search_empty" forceMount>
                    <Search className="mr-2 h-4 w-4 text-fg-faint" aria-hidden />
                    <span className="text-fg-faint">No rows matched.</span>
                  </CommandItem>
                ) : (
                  (searchHits ?? []).map((h, i) => {
                    const pkSeg = encodePkSegment(h.primaryKey);
                    const href = `/c/${connection.id}/tables/${encodeURIComponent(h.table)}/${pkSeg}`;
                    return (
                      <CommandItem
                        key={`${h.table}-${i}-${pkSeg}`}
                        value={`row ${h.table} ${h.matchedColumn} ${h.snippet} ${pkSeg}`}
                        onSelect={() => navigate(href)}
                        forceMount
                      >
                        <Search className="mr-2 h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-mono text-fg-muted">{h.table}</span>
                          <span className="ml-2 text-fg">{h.snippet}</span>
                        </span>
                        <span className="ml-2 shrink-0 font-mono text-[10px] text-fg-faint">
                          {h.matchedColumn}
                        </span>
                      </CommandItem>
                    );
                  })
                )}
              </CommandGroup>
            )}

            <CommandGroup heading="Tables">
              {schemaLoading && tables.length === 0 ? (
                <CommandItem disabled value="__loading_tables">
                  <Table2 className="mr-2 h-4 w-4 text-fg-faint" aria-hidden />
                  <span className="text-fg-faint">Loading tables…</span>
                </CommandItem>
              ) : (
                tables.map(({ table, category, displayName }) => {
                  const Icon = CATEGORY_ICON[category];
                  return (
                    <CommandItem
                      key={`${table.schema}.${table.name}`}
                      value={`${displayName} ${table.name}`}
                      onSelect={() =>
                        navigate(`/c/${connection.id}/tables/${encodeURIComponent(table.name)}`)
                      }
                    >
                      <Icon className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                      <span className="truncate">{displayName}</span>
                      {displayName.toLowerCase() !== table.name.toLowerCase() && (
                        <span className="ml-2 truncate font-mono text-[10px] text-fg-faint">
                          {table.name}
                        </span>
                      )}
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>

            <CommandGroup heading="Connections">
              {connectionsLoading && !connections ? (
                <CommandItem disabled value="__loading_connections">
                  <Database className="mr-2 h-4 w-4 text-fg-faint" aria-hidden />
                  <span className="text-fg-faint">Loading connections…</span>
                </CommandItem>
              ) : (
                <>
                  {(connections ?? []).map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.hostname}`}
                      onSelect={() => navigate(`/c/${c.id}`)}
                    >
                      <Database className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto truncate font-mono text-[10px] text-fg-faint">
                        {c.hostname}
                      </span>
                    </CommandItem>
                  ))}
                  <CommandItem
                    value="new connection"
                    onSelect={() => navigate("/connections/new")}
                  >
                    <Plus className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                    New connection
                  </CommandItem>
                </>
              )}
            </CommandGroup>

            <CommandGroup heading="Settings">
              <CommandItem
                value="connection settings"
                onSelect={() => navigate(`/c/${connection.id}/settings`)}
              >
                <SettingsIcon className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                Connection settings
              </CommandItem>
              <CommandItem
                value="ai assistance"
                onSelect={() => navigate("/settings/ai")}
              >
                <Sparkles className="mr-2 h-4 w-4 text-accent" aria-hidden />
                AI assistance
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Actions">
              <CommandItem
                value="toggle theme"
                onSelect={() => {
                  toggleHtmlTheme();
                  setOpen(false);
                }}
              >
                <SunMoon className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                Toggle theme
              </CommandItem>
              {aiSettings?.hasKey && (
                <CommandItem
                  value="run ai analysis"
                  onSelect={() => navigate("/settings/ai")}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-accent" aria-hidden />
                  Run AI analysis
                </CommandItem>
              )}
              <CommandItem
                value="sign out"
                onSelect={() => {
                  setOpen(false);
                  void signOut({ callbackUrl: "/" });
                }}
              >
                <LogOut className="mr-2 h-4 w-4 text-fg-muted" aria-hidden />
                Sign out
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="border-t hairline px-3 py-2 text-[10px] text-fg-faint">
            <kbd className="mr-1 rounded bg-bg-sunken px-1 py-0.5 font-mono">↵</kbd> select
            <kbd className="ml-3 mr-1 rounded bg-bg-sunken px-1 py-0.5 font-mono">↑↓</kbd> navigate
            <kbd className="ml-3 mr-1 rounded bg-bg-sunken px-1 py-0.5 font-mono">esc</kbd> close
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
