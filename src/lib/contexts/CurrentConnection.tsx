"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { ConnectionSummary } from "@/lib/types/connection";

const CurrentConnectionContext = createContext<ConnectionSummary | null>(null);

export function CurrentConnectionProvider({
  connection,
  children,
}: {
  connection: ConnectionSummary;
  children: ReactNode;
}) {
  return (
    <CurrentConnectionContext.Provider value={connection}>
      {children}
    </CurrentConnectionContext.Provider>
  );
}

export function useCurrentConnection(): ConnectionSummary {
  const c = useContext(CurrentConnectionContext);
  if (!c) throw new Error("useCurrentConnection must be used inside a workspace layout.");
  return c;
}

export function useCurrentConnectionId(): string {
  return useCurrentConnection().id;
}

export function useOptionalConnectionId(): string | null {
  return useContext(CurrentConnectionContext)?.id ?? null;
}
