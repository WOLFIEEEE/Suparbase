import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Connection, clear, load, save } from "./store";
import { createSupabaseClient } from "@/lib/supabase/client";

interface ConnectionContextValue {
  connection: Connection | null;
  client: SupabaseClient | null;
  setConnection: (conn: Connection) => void;
  disconnect: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnectionState] = useState<Connection | null>(() => load());

  // Sync across tabs when localStorage changes.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("suparbase.")) {
        setConnectionState(load());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const client = useMemo<SupabaseClient | null>(() => {
    if (!connection) return null;
    try {
      return createSupabaseClient(connection);
    } catch {
      return null;
    }
  }, [connection]);

  const setConnection = useCallback((conn: Connection) => {
    save(conn);
    setConnectionState(conn);
  }, []);

  const disconnect = useCallback(() => {
    clear();
    setConnectionState(null);
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({ connection, client, setConnection, disconnect }),
    [connection, client, setConnection, disconnect],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used inside <ConnectionProvider>");
  return ctx;
}

export function useRequiredClient(): SupabaseClient {
  const { client } = useConnection();
  if (!client) throw new Error("Supabase client is not available — no active connection.");
  return client;
}
