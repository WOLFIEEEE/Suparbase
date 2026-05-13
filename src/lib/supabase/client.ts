import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Connection } from "@/lib/connection/store";

const ALLOWED_TLDS = [".supabase.co", ".supabase.in"];

function assertSupabaseHost(url: string): void {
  const host = new URL(url).hostname;
  if (!ALLOWED_TLDS.some((tld) => host.endsWith(tld))) {
    throw new Error(`Refusing to create client for non-Supabase host: ${host}`);
  }
}

export function createSupabaseClient(conn: Connection): SupabaseClient {
  assertSupabaseHost(conn.url);
  return createClient(conn.url, conn.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "suparbase-admin/0.1",
      },
    },
  });
}
