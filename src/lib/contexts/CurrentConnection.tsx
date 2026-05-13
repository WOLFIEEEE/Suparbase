"use client";
import { createContext, useContext, type ReactNode } from "react";

const CurrentConnectionContext = createContext<string | null>(null);

export function CurrentConnectionProvider({
  connectionId,
  children,
}: {
  connectionId: string;
  children: ReactNode;
}) {
  return (
    <CurrentConnectionContext.Provider value={connectionId}>
      {children}
    </CurrentConnectionContext.Provider>
  );
}

export function useCurrentConnectionId(): string {
  const id = useContext(CurrentConnectionContext);
  if (!id) throw new Error("useCurrentConnectionId must be used inside a workspace layout.");
  return id;
}

export function useOptionalConnectionId(): string | null {
  return useContext(CurrentConnectionContext);
}
