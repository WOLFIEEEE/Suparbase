"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentConnection } from "@/lib/contexts/CurrentConnection";

/** `g` then one of these jumps to a workspace surface. */
const GO_TO: Array<{ key: string; label: string; sub: string; ownerOnly?: boolean }> = [
  { key: "d", label: "Dashboard", sub: "" },
  { key: "t", label: "Tables", sub: "tables" },
  { key: "s", label: "Schema", sub: "schema" },
  { key: "q", label: "SQL playground", sub: "sql" },
  { key: "f", label: "Storage", sub: "storage" },
  { key: "u", label: "Auth users", sub: "auth-users" },
  { key: "p", label: "Performance", sub: "performance" },
  { key: "a", label: "Activity", sub: "activity" },
  { key: "n", label: "Sentry", sub: "sentry" },
  { key: "r", label: "RLS", sub: "rls" },
  { key: "w", label: "Watches", sub: "watches" },
  { key: "c", label: "Connection settings", sub: "settings", ownerOnly: true },
];

const CHORD_WINDOW_MS = 1200;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Global keyboard layer for the workspace: `?` opens the cheat sheet,
 * `g` + letter navigates (Gmail-style chords). Ignores keystrokes inside
 * inputs and any event with a modifier so it never steals from the app.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const connection = useCurrentConnection();
  const [open, setOpen] = useState(false);
  const [chordArmed, setChordArmed] = useState(false);
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOwner = connection.myRole === "owner";

  useEffect(() => {
    function disarm() {
      setChordArmed(false);
      if (chordTimer.current) clearTimeout(chordTimer.current);
      chordTimer.current = null;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "?" ) {
        e.preventDefault();
        setOpen((v) => !v);
        disarm();
        return;
      }
      if (open) return;
      if (chordArmed) {
        const target = GO_TO.find((g) => g.key === e.key.toLowerCase() && (!g.ownerOnly || isOwner));
        disarm();
        if (target) {
          e.preventDefault();
          router.push(target.sub ? `/c/${connection.id}/${target.sub}` : `/c/${connection.id}`);
        }
        return;
      }
      if (e.key === "g") {
        setChordArmed(true);
        chordTimer.current = setTimeout(disarm, CHORD_WINDOW_MS);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (chordTimer.current) clearTimeout(chordTimer.current);
    };
  }, [chordArmed, connection.id, isOwner, open, router]);

  return (
    <>
      {chordArmed && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border hairline bg-bg-raised px-3 py-1 font-mono text-[11px] text-fg-muted shadow-lg"
        >
          g … then a letter
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-accent" aria-hidden /> Keyboard shortcuts
            </DialogTitle>
            <DialogDescription>Shortcuts are off while you type in a field.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-6 text-xs sm:grid-cols-2">
            <section>
              <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">Global</h3>
              <dl className="space-y-1.5">
                <Row keys={["⌘", "K"]} label="Command palette / search" />
                <Row keys={["?"]} label="This cheat sheet" />
                <Row keys={["Esc"]} label="Close dialogs and menus" />
              </dl>
            </section>
            <section>
              <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">Go to (press g, then…)</h3>
              <dl className="space-y-1.5">
                {GO_TO.filter((g) => !g.ownerOnly || isOwner).map((g) => (
                  <Row key={g.key} keys={["g", g.key]} label={g.label} />
                ))}
              </dl>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd key={i} className="rounded border hairline bg-bg px-1.5 py-0.5 font-mono text-[10px] text-fg">
            {k}
          </kbd>
        ))}
      </dd>
    </div>
  );
}
