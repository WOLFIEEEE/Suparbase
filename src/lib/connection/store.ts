import { decodeJwtRole, type KeyRole } from "./jwt";

const STORAGE_KEY = "suparbase.connection";

export interface Connection {
  url: string;          // origin only, e.g. https://abc.supabase.co
  hostname: string;     // abc.supabase.co
  key: string;          // JWT
  role: KeyRole;
  connectedAt: number;
  remember: boolean;
}

export interface PersistedConnection {
  url: string;
  hostname: string;
  key: string;
  connectedAt: number;
  remember: boolean;
}

export function load(): Connection | null {
  const session = readFrom(sessionStorage);
  if (session) return hydrate(session, false);
  const local = readFrom(localStorage);
  if (local) return hydrate(local, true);
  return null;
}

export function save(conn: Connection): void {
  const payload: PersistedConnection = {
    url: conn.url,
    hostname: conn.hostname,
    key: conn.key,
    connectedAt: conn.connectedAt,
    remember: conn.remember,
  };
  const json = JSON.stringify(payload);
  if (conn.remember) {
    localStorage.setItem(STORAGE_KEY, json);
    sessionStorage.removeItem(STORAGE_KEY);
  } else {
    sessionStorage.setItem(STORAGE_KEY, json);
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clear(): void {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

function readFrom(storage: Storage): PersistedConnection | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedConnection;
    if (!parsed?.url || !parsed?.key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hydrate(p: PersistedConnection, remember: boolean): Connection {
  return {
    url: p.url,
    hostname: p.hostname,
    key: p.key,
    role: decodeJwtRole(p.key),
    connectedAt: p.connectedAt,
    remember,
  };
}
