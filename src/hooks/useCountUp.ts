"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Animate a number from 0 → target once, on mount and whenever the target
 * changes. Returns the current display value. Respects prefers-reduced-motion
 * (jumps straight to the target) and uses an ease-out curve so the count
 * decelerates into place rather than stopping abruptly.
 */
export function useCountUp(target: number | null | undefined, durationMs = 650): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);
  const from = useRef(0);

  useEffect(() => {
    if (target == null || !Number.isFinite(target)) {
      setValue(0);
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || durationMs <= 0) {
      setValue(target);
      return;
    }

    const resolved = target;
    const start = performance.now();
    const startValue = from.current;
    const delta = resolved - startValue;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startValue + delta * eased;
      setValue(current);
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        from.current = resolved;
      }
    }

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      from.current = resolved;
    };
  }, [target, durationMs]);

  return value;
}
