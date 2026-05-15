/**
 * Public-facing types for custom actions. Mirrors the server-side
 * ActionSummary so client components can consume the API directly.
 */

export type ActionScope = "global" | "table" | "row";
export type ActionKind = "sql" | "webhook";
export type ActionWebhookMethod = "POST" | "PATCH" | "PUT" | "DELETE";
export type ActionParamType = "string" | "number" | "boolean" | "json";

export interface ActionParam {
  name: string;
  label: string;
  type: ActionParamType;
  required: boolean;
  placeholder?: string;
}

export interface ActionSummary {
  id: string;
  name: string;
  label: string;
  description: string | null;
  scope: ActionScope;
  tableSchema: string | null;
  tableName: string | null;
  kind: ActionKind;
  danger: boolean;
  readOnly: boolean;
  params: ActionParam[];
  sqlTemplate: string | null;
  webhookUrl: string | null;
  webhookMethod: ActionWebhookMethod | null;
  webhookHeaders: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionExecuteResult {
  kind: "sql" | "webhook";
  sql?: {
    columns: Array<{ name: string; typeOid: number }>;
    rows: unknown[][];
    rowCount: number;
    truncated: boolean;
    elapsedMs: number;
    command: string;
    notices: string[];
    readOnly: boolean;
  };
  webhook?: {
    status: number;
    ok: boolean;
    body: string;
    truncated: boolean;
    elapsedMs: number;
  };
}
