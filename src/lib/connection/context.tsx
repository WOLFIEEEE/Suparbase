import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Connection, clear, load, save } from "./store";
import { createSupabaseClient } from "@/lib/supabase/client";
import { pingConnection } from "./healthcheck";

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

  // Health-check a persisted connection once on mount. If the key has been
  // revoked since last visit, clear it so the user lands back on the connect
  // screen instead of a dashboard full of 401s.
  const checkedRef = useRef(false);
  useEffect(() => {
    if (checkedRef.current) return;
    if (!connection) return;
    checkedRef.current = true;
    let cancelled = false;
    pingConnection(connection).then((result) => {
      if (cancelled) return;
      if (result.status === "unauthorized") {
        clear();
        setConnectionState(null);
        toast.error("Your saved credentials were rejected. Please reconnect.");
      }
    });
    return () => {
      cancelled = true;
    };
    // We deliberately only run this for the initial connection; setConnection
    // afterwards (post-connect) has already been validated by introspection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
