"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { writeThemeCookie } from "@/lib/theme/cookie";
import { Button } from "@/components/ui/button";

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

export function ThemeToggle() {
  const [theme, setTheme] = useState<Resolved>("dark");
  // Resolve once mounted; on the server we don't know the OS pref and must
  // not assume one (server-render the default icon and update on mount).
  useEffect(() => {
    setTheme(readResolvedTheme());
  }, []);

  function toggle() {
    const next: Resolved = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    writeThemeCookie(next);
    setTheme(next);
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
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}
