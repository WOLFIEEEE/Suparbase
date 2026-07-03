export type KeyRole = "anon" | "authenticated" | "service_role" | "unknown";

export type ConnectionRole = "owner" | "editor" | "viewer";

export interface ConnectionSummary {
  id: string;
  name: string;
  hostname: string;
  url: string;
  role: KeyRole;
  createdAt: string;
  lastUsedAt: string;
  hasPostgresUrl: boolean;
  /** Webhook notified when a Sentry scan finds NEW critical findings. */
  alertWebhookUrl: string | null;
  /** Caller's role on the connection. */
  myRole?: ConnectionRole;
}
