export type AgentKind =
  | "cursor"
  | "claude_code"
  | "replit_agent"
  | "lovable"
  | "v0"
  | "vercel_ai_sdk"
  | "openrouter"
  | "aider"
  | "cline"
  | "continue_dev"
  | "windsurf"
  | "codex"
  | "copilot"
  | "gemini_cli"
  | "devin"
  | "bolt"
  | "zed"
  | "amp"
  | "kiro"
  | "opencode"
  | "trae"
  | "junie"
  | "ai_unknown"
  | "browser"
  | "cli"
  | "unknown";

export type SessionStatus =
  | "active"
  | "closed"
  | "undone"
  | "undo_partial"
  | "undo_failed";

export interface SessionSummary {
  id: string;
  kind: AgentKind;
  label: string;
  userAgentRaw: string | null;
  startedAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  status: SessionStatus;
  mutationCount: number;
  tablesTouched: string[];
  undoAttemptedCount: number;
  undoRevertedCount: number;
  undoError: string | null;
}

export interface SessionWrite {
  id: string;
  schemaName: string;
  tableName: string;
  verb: "insert" | "update" | "delete";
  primaryKey: Record<string, unknown>;
  beforeRow: Record<string, unknown> | null;
  afterRow: Record<string, unknown> | null;
  httpStatus: number;
  createdAt: string;
}

export interface UndoResult {
  attempted: number;
  reverted: number;
  skipped: number;
  error: string | null;
}
