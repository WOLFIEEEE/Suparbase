"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

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

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        {/*
          theme="system" honours the user's OS preference (and the
          app's data-theme attribute via prefers-color-scheme).
          Previously hard-coded "dark", which rendered dark toasts in
          light mode — visually inconsistent for low-vision users on
          high-contrast light themes.
        */}
        <Toaster theme="system" position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    </SessionProvider>
  );
}
