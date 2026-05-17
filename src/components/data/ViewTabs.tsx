"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, MoreHorizontal, Plus, Save, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseFilterParams } from "@/lib/filters/parse-url";
import { serializeChipsToParams } from "@/lib/filters/serialize-url";
import { useSavedViews, useCreateView, useDeleteView, useUpdateView } from "@/lib/api/views";
import type { SavedView, ViewState } from "@/lib/types/views";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";

interface Props {
  connectionId: string;
  tableSchema: string;
  tableName: string;
}

const MAX_VIEWS = 5;

/**
 * Tab strip showing "All" + saved views for the current (user, connection,
 * table). Clicking a tab pushes its state into the URL. Saving a view
 * captures the current URL state.
 */
export function ViewTabs({ connectionId, tableSchema, tableName }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const { data: views = [], isLoading } = useSavedViews(connectionId, tableSchema, tableName);
  const createView = useCreateView();
  const deleteView = useDeleteView();
  const updateView = useUpdateView();

  // Active view = URL `view` param matching a saved view id; otherwise "All".
  const activeId = sp.get("view");
  const activeView = useMemo(
    () => views.find((v) => v.id === activeId) ?? null,
    [views, activeId],
  );

  const [saveOpen, setSaveOpen] = useState(false);
  const [renamingView, setRenamingView] = useState<SavedView | null>(null);
  const [draftName, setDraftName] = useState("");

  function currentState(): ViewState {
    return {
      search: sp.get("q") ?? undefined,
      filters: parseFilterParams(sp),
      sort: (() => {
        const raw = sp.get("order");
        if (!raw) return undefined;
        const [col, dir] = raw.split(".");
        if (!col) return undefined;
        return { column: col, direction: dir === "desc" ? ("desc" as const) : ("asc" as const) };
      })(),
    };
  }

  function applyView(view: SavedView | null) {
    const next = new URLSearchParams();
    // Preserve non-stateful params (e.g., page=1, size=…) is intentional NO :
    // when a view applies, every state slot is reset to the view's snapshot.
    next.set("page", "1");
    if (view) {
      next.set("view", view.id);
      if (view.state.search) next.set("q", view.state.search);
      if (view.state.sort) {
        next.set("order", `${view.state.sort.column}.${view.state.sort.direction}`);
      }
      const withFilters = serializeChipsToParams(view.state.filters, next);
      router.push(`?${withFilters.toString()}`);
    } else {
      router.push(`?${next.toString()}`);
    }
  }

  function handleCreate() {
    const name = draftName.trim();
    if (!name) return;
    createView.mutate(
      {
        connectionId,
        schema: tableSchema,
        table: tableName,
        name,
        state: currentState(),
      },
      {
        onSuccess: (view) => {
          setSaveOpen(false);
          setDraftName("");
          toast.success(`Saved view "${view.name}"`);
          applyView(view);
        },
        onError: (e) => {
          const app = e instanceof AppError ? e : new AppError("client_bug", String((e as Error).message ?? e));
          toast.error(app.message);
        },
      },
    );
  }

  function handleRename() {
    if (!renamingView) return;
    const name = draftName.trim();
    if (!name) return;
    updateView.mutate(
      {
        id: renamingView.id,
        connectionId,
        schema: tableSchema,
        table: tableName,
        name,
      },
      {
        onSuccess: () => {
          setRenamingView(null);
          setDraftName("");
          toast.success("Renamed");
        },
        onError: (e) => toast.error(`Rename failed: ${(e as Error).message}`),
      },
    );
  }

  function handleDelete(view: SavedView) {
    deleteView.mutate(
      { id: view.id, connectionId, schema: tableSchema, table: tableName },
      {
        onSuccess: () => {
          if (activeId === view.id) applyView(null);
          toast.success(`Deleted "${view.name}"`);
        },
        onError: (e) => toast.error(`Delete failed: ${(e as Error).message}`),
      },
    );
  }

  function updateActiveViewState() {
    if (!activeView) return;
    updateView.mutate(
      {
        id: activeView.id,
        connectionId,
        schema: tableSchema,
        table: tableName,
        state: currentState(),
      },
      {
        onSuccess: () => toast.success("View updated"),
        onError: (e) => toast.error(`Update failed: ${(e as Error).message}`),
      },
    );
  }

  const atLimit = views.length >= MAX_VIEWS;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <TabButton active={!activeView} onClick={() => applyView(null)}>
        All
      </TabButton>
      {isLoading && views.length === 0 ? (
        <span className="text-[11px] text-fg-faint">loading views…</span>
      ) : (
        views.map((v) => (
          <div key={v.id} className="inline-flex items-center">
            <TabButton active={activeView?.id === v.id} onClick={() => applyView(v)}>
              {v.name}
            </TabButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-0.5 rounded p-1.5 text-fg-faint hover:bg-bg-sunken hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={`Actions for ${v.name}`}
                >
                  <MoreHorizontal className="h-3 w-3" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {activeView?.id === v.id && (
                  <DropdownMenuItem onSelect={updateActiveViewState}>
                    <Save className="mr-2 h-3 w-3" aria-hidden /> Save current state
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setRenamingView(v);
                    setDraftName(v.name);
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleDelete(v)}
                  className="text-danger focus:text-danger"
                >
                  <Trash2 className="mr-2 h-3 w-3" aria-hidden /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={atLimit}
        onClick={() => {
          setDraftName("");
          setSaveOpen(true);
        }}
        title={atLimit ? `Limit of ${MAX_VIEWS} views reached` : "Save current state as a view"}
      >
        <Plus className="h-3 w-3" aria-hidden /> Save view
      </Button>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Published latest"
              autoFocus
              maxLength={40}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={createView.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!draftName.trim() || createView.isPending}>
              {createView.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renamingView} onOpenChange={(o) => { if (!o) setRenamingView(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename view</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="view-rename">Name</Label>
            <Input
              id="view-rename"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
              maxLength={40}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenamingView(null)} disabled={updateView.isPending}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!draftName.trim() || updateView.isPending}>
              {updateView.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] transition-colors",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-line bg-bg-raised text-fg-muted hover:border-line-strong hover:text-fg",
      )}
      aria-pressed={active}
    >
      {active && <Check className="h-3 w-3" aria-hidden />}
      {children}
    </button>
  );
}
