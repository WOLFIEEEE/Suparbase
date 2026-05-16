"use client";
import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnalyticsBoot } from "@/lib/analytics/AnalyticsBoot";

type Resolved = "light" | "dark";

/**
 * Track the *resolved* theme (data-theme attr on <html> with OS
 * preference as fallback). The Sonner Toaster's `theme="system"`
 * only watches prefers-color-scheme, so when the user toggles via
 * ThemeToggle (which writes data-theme), Sonner doesn't notice.
 * MutationObserver bridges the gap.
 */
function useResolvedTheme(): Resolved {
  const [theme, setTheme] = useState<Resolved>("dark");
  useEffect(() => {
    const compute = (): Resolved => {
      const explicit = document.documentElement.dataset.theme;
      if (explicit === "light" || explicit === "dark") return explicit;
      return window.matchMedia?.("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    };
    setTheme(compute());
    const obs = new MutationObserver(() => setTheme(compute()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const onMq = () => {
      if (!document.documentElement.dataset.theme) setTheme(compute());
    };
    mq?.addEventListener?.("change", onMq);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.("change", onMq);
    };
  }, []);
  return theme;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              const status = (error as { status?: number })?.status;
              if (status === 401 || status === 403 || status === 404) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const resolvedTheme = useResolvedTheme();

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <AnalyticsBoot />
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        {/*
          Pass the resolved theme so toasts re-paint when the user
          flips ThemeToggle — Sonner's own theme="system" only
          watches prefers-color-scheme and ignores our data-theme.
        */}
        <Toaster theme={resolvedTheme} position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    </SessionProvider>
  );
}
