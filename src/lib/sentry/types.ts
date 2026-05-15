export type FindingKind =
  | "rls_disabled"
  | "anon_read"
  | "anon_read_pii"
  | "policy_overly_permissive"
  | "public_bucket"
  | "scan_error";

export type FindingSeverity = "info" | "warn" | "critical";
export type FindingStatus = "open" | "acknowledged" | "quarantined" | "resolved";

export interface FindingDetails {
  matchedColumns?: string[];
  policyName?: string;
  policyDefinition?: string;
  rowCount?: number;
  message?: string;
}

export interface FindingSummary {
  id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  status: FindingStatus;
  schemaName: string | null;
  tableName: string | null;
  columnName: string | null;
  details: FindingDetails;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  quarantinePolicyName: string | null;
}

export interface ScanSummary {
  id: string;
  startedAt: string;
  completedAt: string | null;
  tablesScanned: string[];
  findingsCount: number;
  error: string | null;
}

export interface ScanRunResult {
  scanId: string;
  findings: number;
  tablesScanned: string[];
  durationMs: number;
}
