"use client";
import { useEffect, useReducer, useRef } from "react";
import { cn } from "@/lib/ui/cn";

const COMMANDS = [
  "ship --everywhere",
  "connect --supabase",
  "query --read-only",
  "audit --diff before-after",
] as const;

const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1400;
const POST_DELETE_MS = 300;

interface State {
  index: number;     // which COMMANDS entry
  typed: number;     // characters typed
  phase: "typing" | "holding" | "deleting" | "pausing";
}

type Action = { type: "tick" };

function reducer(state: State, action: Action): State {
  if (action.type !== "tick") return state;
  const cmd = COMMANDS[state.index]!;
  if (state.phase === "typing") {
    if (state.typed < cmd.length) return { ...state, typed: state.typed + 1 };
    return { ...state, phase: "holding" };
  }
  if (state.phase === "holding") {
    return { ...state, phase: "deleting" };
  }
  if (state.phase === "deleting") {
    if (state.typed > 0) return { ...state, typed: state.typed - 1 };
    return { ...state, phase: "pausing" };
  }
  // pausing -> next command
  return {
    index: (state.index + 1) % COMMANDS.length,
    typed: 0,
    phase: "typing",
  };
}

/**
 * Animated terminal-style command line. Types out a rotating set of
 * commands; respects prefers-reduced-motion (renders the first command
 * statically). Used in the footer manifesto.
 */
export function TypingPrompt({ className }: { className?: string }) {
  const [state, dispatch] = useReducer(reducer, {
    index: 0,
    typed: 0,
    phase: "typing" as State["phase"],
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    if (reducedMotionRef.current) return;
    const delay =
      state.phase === "typing"
        ? TYPE_MS
        : state.phase === "deleting"
        ? DELETE_MS
        : state.phase === "holding"
        ? HOLD_MS
        : POST_DELETE_MS;
    timerRef.current = setTimeout(() => dispatch({ type: "tick" }), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state]);

  const command = COMMANDS[state.index]!;
  const visible = reducedMotionRef.current ? COMMANDS[0] : command.slice(0, state.typed);

  return (
    <div
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint",
        className,
      )}
    >
      <span className="text-accent">~/suparbase</span> ${" "}
      <span className="text-fg-muted">{visible}</span>
      <span
        aria-hidden
        className="ml-0.5 inline-block h-3 w-[6px] -mb-[2px] animate-pulse bg-accent align-baseline"
      />
    </div>
  );
}
