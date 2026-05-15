import "server-only";
import type { ConnectionRow } from "@/server/schema/connections";
import { executeSql, SqlExecutionError, type SqlExecuteResult } from "@/server/proxy/sql-playground";
import type { ActionParam } from "@/server/schema/custom-actions";
import type { ActionSummary } from "./repo";
import { AppError } from "@/lib/errors";

const STATEMENT_TIMEOUT_MS = 10_000;
const WEBHOOK_TIMEOUT_MS = 15_000;
const WEBHOOK_BODY_CAP = 64 * 1024;

export interface ActionExecuteInput {
  action: ActionSummary;
  conn: ConnectionRow;
  /** User-supplied param values, keyed by param name. */
  params: Record<string, unknown>;
  /** Primary key of the row this action targets (row-scoped only). */
  primaryKey?: Record<string, unknown>;
}

export interface ActionExecuteResult {
  kind: "sql" | "webhook";
  sql?: SqlExecuteResult;
  webhook?: {
    status: number;
    ok: boolean;
    body: string;
    truncated: boolean;
    elapsedMs: number;
  };
}

/**
 * Coerce a param value to its declared shape. Anything that doesn't fit
 * throws, actions are intended to be reproducible, so we don't silently
 * cast garbage. Returns the canonical JS value to pass into the SQL
 * driver or webhook body.
 */
function coerce(p: ActionParam, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") {
    if (p.required) {
      throw new AppError("validation", `Missing required param: ${p.name}.`);
    }
    return null;
  }
  switch (p.type) {
    case "string":
      return String(raw);
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isNaN(n)) {
        throw new AppError("validation", `Param "${p.name}" must be a number.`);
      }
      return n;
    }
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new AppError("validation", `Param "${p.name}" must be true or false.`);
    case "json":
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          throw new AppError("validation", `Param "${p.name}" must be valid JSON.`);
        }
      }
      return raw;
    default:
      return raw;
  }
}

function buildSqlValues(action: ActionSummary, params: Record<string, unknown>, pk?: Record<string, unknown>): unknown[] {
  // Convention: $1..$N map to params in declaration order.
  // For row-scoped actions, $1 is the primary-key JSON blob unless an
  // explicit param is declared.
  const values: unknown[] = [];
  if (action.scope === "row" && pk) {
    values.push(pk);
  }
  for (const p of action.params) {
    values.push(coerce(p, params[p.name]));
  }
  return values;
}

export async function runAction(input: ActionExecuteInput): Promise<ActionExecuteResult> {
  const { action } = input;

  if (action.kind === "sql") {
    if (!action.sqlTemplate) {
      throw new AppError("validation", "Action has no SQL template.");
    }
    // Interpolate $1, $2, … via parametrised query, postgres.js handles
    // binding, so the SQL template is never string-concatenated.
    const values = buildSqlValues(action, input.params, input.primaryKey);

    try {
      const sql = await executeSql({
        conn: input.conn,
        sql: action.sqlTemplate,
        readOnly: action.readOnly,
        statementTimeoutMs: STATEMENT_TIMEOUT_MS,
        params: values,
      });
      return { kind: "sql", sql };
    } catch (e) {
      if (e instanceof SqlExecutionError) {
        throw new AppError(
          e.category === "rls" ? "rls" : e.category === "validation" ? "validation" : "server",
          e.message,
        );
      }
      throw e;
    }
  }

  if (action.kind === "webhook") {
    if (!action.webhookUrl) {
      throw new AppError("validation", "Action has no webhook URL.");
    }
    const method = action.webhookMethod ?? "POST";
    const payload: Record<string, unknown> = {
      action: action.name,
      params: {},
      ...(input.primaryKey ? { primaryKey: input.primaryKey } : {}),
    };
    for (const p of action.params) {
      (payload.params as Record<string, unknown>)[p.name] = coerce(p, input.params[p.name]);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    const start = Date.now();
    try {
      const res = await fetch(action.webhookUrl, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Suparbase-Action/1.0",
          ...(action.webhookHeaders ?? {}),
        },
        body: method === "DELETE" ? undefined : JSON.stringify(payload),
      });
      const text = await res.text();
      const truncated = text.length > WEBHOOK_BODY_CAP;
      const body = truncated ? text.slice(0, WEBHOOK_BODY_CAP) : text;
      return {
        kind: "webhook",
        webhook: {
          status: res.status,
          ok: res.ok,
          body,
          truncated,
          elapsedMs: Date.now() - start,
        },
      };
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        throw new AppError("server", "Webhook timed out.");
      }
      throw new AppError("server", `Webhook failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AppError("validation", `Unknown action kind: ${(action as ActionSummary).kind}.`);
}
