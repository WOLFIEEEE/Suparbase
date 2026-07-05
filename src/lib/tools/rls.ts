/**
 * Deterministic Row-Level-Security policy generator + explainer for the
 * free `/tools/rls-policy-generator` page. No AI, no network — pure string
 * work, so it runs in the browser and is fully unit-testable.
 */

export type RlsPattern =
  | "owner"
  | "public_read"
  | "authenticated_read"
  | "authenticated_all"
  | "admin_only"
  | "service_only";

export interface RlsGenerateInput {
  table: string;
  /** Schema, defaults to public. */
  schema?: string;
  pattern: RlsPattern;
  /** Column that holds the owning user's id (for the `owner` pattern). */
  ownerColumn?: string;
}

/** Quote a Postgres identifier (double-quote, escape embedded quotes). */
function qi(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** A safe, readable policy name fragment from a table + suffix. */
function policyName(table: string, suffix: string): string {
  const slug = table.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
  return `${slug}_${suffix}`;
}

export const PATTERN_META: Record<RlsPattern, { label: string; description: string; needsOwnerColumn?: boolean }> = {
  owner: {
    label: "Owner-only (per-user rows)",
    description: "Each user can only read and write rows they own (matched by a user-id column against auth.uid()).",
    needsOwnerColumn: true,
  },
  public_read: {
    label: "Public read, no writes",
    description: "Anyone (even anonymous) can SELECT; nobody can write through the API.",
  },
  authenticated_read: {
    label: "Authenticated read, no writes",
    description: "Any signed-in user can SELECT; nobody can write through the API.",
  },
  authenticated_all: {
    label: "Authenticated read + write",
    description: "Any signed-in user can read and write every row. Use for shared, non-sensitive tables.",
  },
  admin_only: {
    label: "Admin claim only",
    description: "Only tokens whose JWT carries a truthy `is_admin` / role=admin claim can access rows.",
  },
  service_only: {
    label: "Service-role only (lock out the API)",
    description: "RLS with no permissive policy: the anon and authenticated roles get nothing; only the service_role key (server-side) can touch the table.",
  },
};

/**
 * Generate `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` SQL for one of the
 * common access patterns. The output is copy-paste-ready for the Supabase
 * SQL editor.
 */
export function generateRlsPolicies(input: RlsGenerateInput): string {
  const schema = input.schema?.trim() || "public";
  const table = input.table.trim();
  if (!table) throw new Error("Table name is required.");
  const tbl = `${qi(schema)}.${qi(table)}`;
  const owner = (input.ownerColumn ?? "user_id").trim() || "user_id";

  const header = [
    `-- RLS for ${schema}.${table} — pattern: ${PATTERN_META[input.pattern].label}`,
    `ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`,
    "",
  ];

  const body: string[] = [];
  switch (input.pattern) {
    case "owner":
      body.push(
        `CREATE POLICY ${qi(policyName(table, "select_own"))} ON ${tbl}`,
        `  FOR SELECT TO authenticated`,
        `  USING (${qi(owner)} = auth.uid());`,
        "",
        `CREATE POLICY ${qi(policyName(table, "insert_own"))} ON ${tbl}`,
        `  FOR INSERT TO authenticated`,
        `  WITH CHECK (${qi(owner)} = auth.uid());`,
        "",
        `CREATE POLICY ${qi(policyName(table, "update_own"))} ON ${tbl}`,
        `  FOR UPDATE TO authenticated`,
        `  USING (${qi(owner)} = auth.uid())`,
        `  WITH CHECK (${qi(owner)} = auth.uid());`,
        "",
        `CREATE POLICY ${qi(policyName(table, "delete_own"))} ON ${tbl}`,
        `  FOR DELETE TO authenticated`,
        `  USING (${qi(owner)} = auth.uid());`,
      );
      break;
    case "public_read":
      body.push(
        `CREATE POLICY ${qi(policyName(table, "public_select"))} ON ${tbl}`,
        `  FOR SELECT TO anon, authenticated`,
        `  USING (true);`,
      );
      break;
    case "authenticated_read":
      body.push(
        `CREATE POLICY ${qi(policyName(table, "auth_select"))} ON ${tbl}`,
        `  FOR SELECT TO authenticated`,
        `  USING (true);`,
      );
      break;
    case "authenticated_all":
      body.push(
        `CREATE POLICY ${qi(policyName(table, "auth_all"))} ON ${tbl}`,
        `  FOR ALL TO authenticated`,
        `  USING (true)`,
        `  WITH CHECK (true);`,
      );
      break;
    case "admin_only":
      body.push(
        `-- Assumes an \`is_admin\` boolean is set in the JWT claims (custom access token hook).`,
        `CREATE POLICY ${qi(policyName(table, "admin_all"))} ON ${tbl}`,
        `  FOR ALL TO authenticated`,
        `  USING (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false))`,
        `  WITH CHECK (coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false));`,
      );
      break;
    case "service_only":
      body.push(
        `-- No permissive policy: with RLS enabled and no policy, the anon and`,
        `-- authenticated roles are denied everything. Only the service_role key`,
        `-- (used server-side) bypasses RLS. This is the safest default for a`,
        `-- table the browser should never touch directly.`,
      );
      break;
  }

  return [...header, ...body].join("\n").trim() + "\n";
}

// ── Explainer ────────────────────────────────────────────────────────────

export interface RlsExplanation {
  ok: boolean;
  policyName: string | null;
  table: string | null;
  command: string;
  roles: string[];
  using: string | null;
  withCheck: string | null;
  summary: string;
}

/**
 * Parse a single `CREATE POLICY …` statement and describe it in plain
 * English. Best-effort regex parse — good enough for the pasted-policy
 * explainer; not a full SQL parser.
 */
export function explainPolicy(sql: string): RlsExplanation {
  const text = sql.trim().replace(/;\s*$/, "");
  const nameMatch = text.match(/create\s+policy\s+"?([a-zA-Z0-9_ ]+?)"?\s+on\s+([a-zA-Z0-9_."]+)/i);
  if (!nameMatch) {
    return {
      ok: false,
      policyName: null,
      table: null,
      command: "ALL",
      roles: [],
      using: null,
      withCheck: null,
      summary: "Couldn't parse a CREATE POLICY statement. Paste a full `CREATE POLICY \"name\" ON table …` statement.",
    };
  }
  const policyName = nameMatch[1]!.trim();
  const table = nameMatch[2]!.replace(/"/g, "");

  const cmdMatch = text.match(/\bfor\s+(all|select|insert|update|delete)\b/i);
  const command = (cmdMatch?.[1] ?? "ALL").toUpperCase();

  const toMatch = text.match(/\bto\s+([a-zA-Z0-9_,\s]+?)(?:\s+using|\s+with\s+check|$)/i);
  const roles = toMatch
    ? toMatch[1]!.split(",").map((r) => r.trim()).filter(Boolean)
    : ["public"];

  const usingMatch = text.match(/\busing\s*\(([\s\S]*?)\)\s*(?:with\s+check|$)/i);
  const withCheckMatch = text.match(/\bwith\s+check\s*\(([\s\S]*)\)/i);
  const using = usingMatch ? usingMatch[1]!.trim() : null;
  const withCheck = withCheckMatch ? withCheckMatch[1]!.trim() : null;

  const roleText =
    roles.includes("public") || roles.length === 0
      ? "everyone (including anonymous visitors)"
      : roles.join(" and ");
  const cmdText =
    command === "ALL" ? "read and write" : command === "SELECT" ? "read" : command.toLowerCase();

  let condText = "";
  if (using && /^\s*true\s*$/i.test(using)) {
    condText = " every row with no restriction";
  } else if (using) {
    condText = ` rows where ${using}`;
  }

  const summary =
    `Policy “${policyName}” lets ${roleText} ${cmdText}${condText} on ${table}.` +
    (withCheck ? ` New/updated rows must satisfy: ${withCheck}.` : "") +
    (using && /^\s*true\s*$/i.test(using) && (roles.includes("anon") || roles.includes("public"))
      ? " ⚠️ This is fully public — anyone can read the whole table."
      : "");

  return { ok: true, policyName, table, command, roles, using, withCheck, summary };
}
