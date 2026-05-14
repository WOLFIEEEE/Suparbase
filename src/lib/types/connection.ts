export type KeyRole = "anon" | "authenticated" | "service_role" | "unknown";

export interface ConnectionSummary {
  id: string;
  name: string;
  hostname: string;
  url: string;
  role: KeyRole;
  createdAt: string;
  lastUsedAt: string;
  hasPostgresUrl: boolean;
}
