export type KeyRole = "anon" | "authenticated" | "service_role" | "unknown";

export type ConnectionRole = "owner" | "editor" | "viewer";

/** Owner-assigned deployment tier. Mirrors `ConnectionEnvironment` on the server schema. */
export type ConnectionEnvironment = "production" | "staging" | "development" | "other";

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
  /** Safe presence flag for non-owner workspace members. */
  hasAlertWebhook: boolean;
  /** Caller's role on the connection. */
  myRole?: ConnectionRole;
  /** Deployment tier label; null until the owner sets one. */
  environment: ConnectionEnvironment | null;
  /** Scheduled Sentry scan cadence in hours; null = off. */
  sentryScanIntervalHours: number | null;
  sentryLastAutoScanAt: string | null;
}
