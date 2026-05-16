"use client";

/**
 * Conversation list pane for the AI chat drawer. Slides in from the left
 * inside the drawer (controlled by parent) and shows up to MAX_CONVERSATIONS
 * past chats, with New / Switch / Delete / Export actions.
 */

import { useState } from "react";
import { Download, MessageSquare, Plus, Trash2 } from "lucide-react";
import type { Conversation } from "@/lib/chat/storage";
import { exportAsMarkdown, relativeTime } from "@/lib/chat/storage";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/lib/ui/use-confirm";
import { cn } from "@/lib/ui/cn";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ChatConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: Props) {
  const ordered = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const confirm = useConfirm();
  const [pendingTitle, setPendingTitle] = useState<string>("");

  const handleExport = (conv: Conversation) => {
    const md = exportAsMarkdown(conv);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conv.title.replace(/[^\w\d-]+/g, "-").slice(0, 40) || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="flex h-full min-h-0 w-60 shrink-0 flex-col border-r hairline bg-bg-raised/40">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b hairline px-3 py-2.5">
        <span className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
          Conversations
        </span>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1 rounded-md border hairline bg-bg px-1.5 py-1 text-[11px] text-fg hover:border-line-strong"
          aria-label="New conversation"
        >
          <Plus className="h-3 w-3" aria-hidden />
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ordered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <MessageSquare className="h-4 w-4 text-fg-faint" aria-hidden />
            <p className="text-[11px] text-fg-faint">
              No chats yet. Start a new conversation.
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5 p-1.5">
            {ordered.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "block w-full rounded-md px-2 py-1.5 text-left transition-colors",
                      isActive
                        ? "bg-bg-sunken text-fg"
                        : "text-fg-muted hover:bg-bg-sunken/60 hover:text-fg",
                    )}
                  >
                    <span className="block truncate text-[12px] font-medium">
                      {c.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-fg-faint">
                      <span>{c.messages.length} msg</span>
                      <span>·</span>
                      <span>{relativeTime(c.updatedAt)}</span>
                      {c.totalTokens > 0 && (
                        <>
                          <span>·</span>
                          <span className="tabular-nums">
                            {c.totalTokens.toLocaleString()} tok
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                  <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(c);
                      }}
                      className="rounded p-1 text-fg-faint hover:bg-bg-raised hover:text-fg"
                      aria-label="Export as markdown"
                      title="Export as markdown"
                    >
                      <Download className="h-3 w-3" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingTitle(c.title);
                        confirm.ask(() => onDelete(c.id));
                      }}
                      className="rounded p-1 text-fg-faint hover:bg-danger/10 hover:text-danger"
                      aria-label="Delete conversation"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        {...confirm.dialogProps}
        title="Delete conversation?"
        description={
          <>
            Permanently deletes <strong>{pendingTitle}</strong> and its messages
            from this browser. Cannot be undone.
          </>
        }
        confirmLabel="Delete"
        tone="danger"
      />
    </aside>
  );
}
