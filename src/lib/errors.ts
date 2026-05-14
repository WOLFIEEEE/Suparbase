import { redact } from "@/lib/redact";

export type ErrorCategory =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "constraint"
  | "rate_limited"
  | "server"
  | "client_bug"
  | "validation"
  | "no_key"
  | "no_postgres_url"
  | "rls"
  | "service_role_required";

export interface AppErrorOptions {
  cause?: unknown;
  columnHint?: string;
  raw?: unknown;
}

export class AppError extends Error {
  category: ErrorCategory;
  columnHint?: string;
  cause?: unknown;
  raw?: unknown;

  constructor(category: ErrorCategory, message: string, options: AppErrorOptions = {}) {
    super(redact(message));
    this.name = "AppError";
    this.category = category;
    this.columnHint = options.columnHint;
    this.cause = options.cause;
    this.raw = options.raw;
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
}

function extractColumnFromDetails(details: string | undefined): string | undefined {
  if (!details) return undefined;
  // Postgres patterns:
  //   Key (column_name)=(value) already exists.
  //   null value in column "column_name" violates not-null constraint
  //   new row for relation "t" violates check constraint "..." column "column_name"
  const keyMatch = details.match(/Key \(([^)]+)\)=/);
  if (keyMatch?.[1]) return keyMatch[1].split(",")[0]?.trim();
  const colMatch = details.match(/column "([^"]+)"/);
  if (colMatch?.[1]) return colMatch[1];
  return undefined;
}

export function toAppError(input: unknown): AppError {
  if (input instanceof AppError) return input;

  if (typeof input === "object" && input !== null) {
    const e = input as PostgrestLikeError;

    if (typeof e.code === "string" && e.code.startsWith("23")) {
      // 23xxx: integrity constraint violations
      return new AppError(
        "constraint",
        redact(e.message ?? "Database constraint violated."),
        {
          columnHint: extractColumnFromDetails(e.details ?? e.message),
          raw: input,
        },
      );
    }

    if (e.code === "PGRST301" || e.status === 401) {
      return new AppError("unauthorized", redact(e.message ?? "Unauthorized."), { raw: input });
    }

    if (e.status === 403) {
      return new AppError("forbidden", redact(e.message ?? "Forbidden."), { raw: input });
    }
    if (e.status === 404) {
      return new AppError("not_found", redact(e.message ?? "Not found."), { raw: input });
    }
    if (e.status === 429) {
      return new AppError("rate_limited", "Supabase rate-limited this request.", { raw: input });
    }
    if (typeof e.status === "number" && e.status >= 500) {
      return new AppError("server", redact(e.message ?? `Server error (${e.status}).`), { raw: input });
    }

    if (input instanceof TypeError) {
      return new AppError("network", "Could not reach Supabase.", { cause: input });
    }
  }

  if (input instanceof Error) {
    return new AppError("client_bug", redact(input.message), { cause: input });
  }

  return new AppError("client_bug", "An unexpected error occurred.");
}
