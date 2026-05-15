import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  customActions,
  type ActionKind,
  type ActionParam,
  type ActionScope,
  type ActionWebhookMethod,
  type CustomActionRow,
} from "@/server/schema/custom-actions";
import { AppError } from "@/lib/errors";

const NAME_RX = /^[a-z][a-z0-9_-]{0,39}$/;
const LABEL_MIN = 1;
const LABEL_MAX = 60;
const DESC_MAX = 200;
const SQL_MAX = 8_000;
const URL_MAX = 500;
const MAX_PARAMS = 8;
const MAX_PER_CONNECTION = 100;

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

export function toSummary(row: CustomActionRow): ActionSummary {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    description: row.description,
    scope: row.scope,
    tableSchema: row.tableSchema,
    tableName: row.tableName,
    kind: row.kind,
    danger: row.danger,
    readOnly: row.readOnly,
    params: row.params ?? [],
    sqlTemplate: row.sqlTemplate,
    webhookUrl: row.webhookUrl,
    webhookMethod: row.webhookMethod,
    webhookHeaders: row.webhookHeaders,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ActionInput {
  name: string;
  label: string;
  description?: string | null;
  scope: ActionScope;
  tableSchema?: string | null;
  tableName?: string | null;
  kind: ActionKind;
  sqlTemplate?: string | null;
  readOnly?: boolean;
  webhookUrl?: string | null;
  webhookMethod?: ActionWebhookMethod | null;
  webhookHeaders?: Record<string, string> | null;
  params?: ActionParam[];
  danger?: boolean;
}

function validate(input: ActionInput): void {
  if (!NAME_RX.test(input.name)) {
    throw new AppError(
      "validation",
      "Name must be lowercase letters, numbers, hyphens, or underscores (≤ 40 chars).",
    );
  }
  if (input.label.trim().length < LABEL_MIN || input.label.length > LABEL_MAX) {
    throw new AppError("validation", `Label must be 1–${LABEL_MAX} characters.`);
  }
  if (input.description && input.description.length > DESC_MAX) {
    throw new AppError("validation", `Description must be ≤ ${DESC_MAX} characters.`);
  }
  if (input.scope !== "global" && (!input.tableName || !input.tableSchema)) {
    throw new AppError(
      "validation",
      "Table-scoped and row-scoped actions need a schema + table.",
    );
  }
  if (input.kind === "sql") {
    if (!input.sqlTemplate || !input.sqlTemplate.trim()) {
      throw new AppError("validation", "SQL template is required for SQL actions.");
    }
    if (input.sqlTemplate.length > SQL_MAX) {
      throw new AppError("validation", `SQL template too long (max ${SQL_MAX}).`);
    }
  }
  if (input.kind === "webhook") {
    if (!input.webhookUrl || !input.webhookUrl.trim()) {
      throw new AppError("validation", "Webhook URL is required for webhook actions.");
    }
    if (input.webhookUrl.length > URL_MAX) {
      throw new AppError("validation", "Webhook URL is too long.");
    }
    try {
      const u = new URL(input.webhookUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        throw new Error("scheme");
      }
      // Block obvious SSRF targets. Self-hosters can lift this if they
      // really need to call internal hosts — the comment above the regex
      // hints at the trade-off.
      //
      // Hostname comes from URL parsing, so IPv6 addresses have already
      // had their surrounding `[...]` stripped. We strip again defensively
      // and lower-case for case-insensitive name matches.
      const raw = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      // Cloud-metadata IPs (AWS / GCP / Azure / DO / Oracle all use
      // 169.254.169.254). Already covered by the `169.254.` prefix below
      // for the AWS/GCP shape, but call it out explicitly so the rule
      // is obvious to readers.
      const isCloudMetadataHost =
        raw === "metadata.google.internal" ||
        raw === "metadata.azure.com" ||
        raw === "instance-data" ||
        raw === "169.254.169.254";
      const isIpv6Loopback =
        raw === "::1" ||
        raw === "::" ||
        raw === "::ffff:0:0" ||
        raw.startsWith("::ffff:127.") ||
        raw.startsWith("fe80:") ||
        raw.startsWith("fc00:") ||
        raw.startsWith("fd00:");
      const isIpv4Private =
        raw === "localhost" ||
        raw === "0.0.0.0" ||
        raw.startsWith("127.") ||
        raw.startsWith("10.") ||
        raw.startsWith("169.254.") ||
        raw.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(raw);
      if (isCloudMetadataHost || isIpv6Loopback || isIpv4Private) {
        throw new AppError(
          "validation",
          "Webhook URL must not target a private network or cloud-metadata service.",
        );
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("validation", "Webhook URL is invalid.");
    }
    const method = input.webhookMethod ?? "POST";
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      throw new AppError("validation", "Webhook method must be POST, PATCH, PUT, or DELETE.");
    }
  }
  if (input.params && input.params.length > MAX_PARAMS) {
    throw new AppError("validation", `At most ${MAX_PARAMS} params per action.`);
  }
  const seen = new Set<string>();
  for (const p of input.params ?? []) {
    if (!NAME_RX.test(p.name)) {
      throw new AppError("validation", `Param "${p.name}": invalid name.`);
    }
    if (seen.has(p.name)) {
      throw new AppError("validation", `Duplicate param name: ${p.name}.`);
    }
    seen.add(p.name);
  }
}

export async function listActionsForConnection(
  userId: string,
  connectionId: string,
): Promise<ActionSummary[]> {
  const rows = await db
    .select()
    .from(customActions)
    .where(
      and(eq(customActions.userId, userId), eq(customActions.connectionId, connectionId)),
    )
    .orderBy(asc(customActions.createdAt));
  return rows.map(toSummary);
}

export async function listActionsForTable(
  userId: string,
  connectionId: string,
  tableSchema: string,
  tableName: string,
): Promise<ActionSummary[]> {
  const all = await listActionsForConnection(userId, connectionId);
  return all.filter(
    (a) =>
      a.scope === "global" ||
      (a.tableSchema === tableSchema && a.tableName === tableName),
  );
}

export async function getAction(
  userId: string,
  connectionId: string,
  actionId: string,
): Promise<ActionSummary | null> {
  const [row] = await db
    .select()
    .from(customActions)
    .where(
      and(
        eq(customActions.id, actionId),
        eq(customActions.userId, userId),
        eq(customActions.connectionId, connectionId),
      ),
    )
    .limit(1);
  return row ? toSummary(row) : null;
}

export async function createAction(
  userId: string,
  connectionId: string,
  input: ActionInput,
): Promise<ActionSummary> {
  validate(input);

  const existing = await listActionsForConnection(userId, connectionId);
  if (existing.length >= MAX_PER_CONNECTION) {
    throw new AppError(
      "validation",
      `You already have ${MAX_PER_CONNECTION} actions on this connection.`,
    );
  }
  if (existing.some((a) => a.name === input.name)) {
    throw new AppError("validation", `An action named "${input.name}" already exists.`);
  }

  const [row] = await db
    .insert(customActions)
    .values({
      userId,
      connectionId,
      name: input.name,
      label: input.label,
      description: input.description ?? null,
      scope: input.scope,
      tableSchema: input.tableSchema ?? null,
      tableName: input.tableName ?? null,
      kind: input.kind,
      sqlTemplate: input.sqlTemplate ?? null,
      readOnly: input.readOnly ?? false,
      webhookUrl: input.webhookUrl ?? null,
      webhookMethod: input.webhookMethod ?? null,
      webhookHeaders: input.webhookHeaders ?? null,
      params: input.params ?? [],
      danger: input.danger ?? false,
    })
    .returning();
  return toSummary(row);
}

export async function updateAction(
  userId: string,
  connectionId: string,
  actionId: string,
  input: ActionInput,
): Promise<ActionSummary | null> {
  validate(input);
  const [row] = await db
    .update(customActions)
    .set({
      name: input.name,
      label: input.label,
      description: input.description ?? null,
      scope: input.scope,
      tableSchema: input.tableSchema ?? null,
      tableName: input.tableName ?? null,
      kind: input.kind,
      sqlTemplate: input.sqlTemplate ?? null,
      readOnly: input.readOnly ?? false,
      webhookUrl: input.webhookUrl ?? null,
      webhookMethod: input.webhookMethod ?? null,
      webhookHeaders: input.webhookHeaders ?? null,
      params: input.params ?? [],
      danger: input.danger ?? false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customActions.id, actionId),
        eq(customActions.userId, userId),
        eq(customActions.connectionId, connectionId),
      ),
    )
    .returning();
  return row ? toSummary(row) : null;
}

export async function deleteAction(
  userId: string,
  connectionId: string,
  actionId: string,
): Promise<boolean> {
  const res = await db
    .delete(customActions)
    .where(
      and(
        eq(customActions.id, actionId),
        eq(customActions.userId, userId),
        eq(customActions.connectionId, connectionId),
      ),
    )
    .returning({ id: customActions.id });
  return res.length > 0;
}
