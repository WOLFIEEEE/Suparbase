"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { writeThemeCookie } from "@/lib/theme/cookie";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

type Resolved = "light" | "dark";

function readResolvedTheme(): Resolved {
  if (typeof document === "undefined") return "dark";
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  // No explicit choice: fall back to the OS preference.
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

interface Props {
  /** Tooltip-only buttons in cramped headers can hide the label. */
  className?: string;
}

export function ThemeToggle({ className }: Props) {
  const [theme, setTheme] = useState<Resolved>("dark");
  // Resolve once mounted; on the server we don't know the OS pref and must
  // not assume one (server-render the default icon and update on mount).
  useEffect(() => {
    setTheme(readResolvedTheme());

    // React to OS-preference changes when the user hasn't explicitly chosen.
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const handler = () => {
      if (!document.documentElement.dataset.theme) {
        setTheme(readResolvedTheme());
      }
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  function toggle() {
    const next: Resolved = theme === "light" ? "dark" : "light";
    const root = document.documentElement;

    // Add the transition class just for the duration of the swap so the
    // colour-driven properties (bg, border, text, fill, stroke) animate
    // smoothly. We never leave it on, to keep idle hover transitions snappy.
    root.classList.add("theme-transitioning");
    root.dataset.theme = next;
    writeThemeCookie(next);
    setTheme(next);
    window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
    }, 260);
  }

  const isDark = theme === "dark";
  const nextLabel = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={nextLabel}
      title={nextLabel}
      className={cn("relative overflow-hidden", className)}
    >
      <span className="relative inline-block h-4 w-4">
        <Sun
          className={cn(
            "absolute inset-0 h-4 w-4 transition-all duration-300 ease-out",
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0",
          )}
          aria-hidden
        />
        <Moon
          className={cn(
            "absolute inset-0 h-4 w-4 transition-all duration-300 ease-out",
            isDark
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100",
          )}
          aria-hidden
        />
      </span>
    </Button>
  );
}
