import type { ConnectionEnvironment } from "@/lib/types/connection";

/**
 * Display metadata for the connection environment label. Kept in one
 * place so the badge, the settings picker, and the destructive-action
 * guards agree on wording and colour.
 */
export interface EnvironmentMeta {
  label: string;
  tone: "danger" | "warn" | "accent" | "neutral";
  hint: string;
}

export const ENVIRONMENT_META: Record<ConnectionEnvironment, EnvironmentMeta> = {
  production: {
    label: "Production",
    tone: "danger",
    hint: "Real users, real data. Destructive actions ask you to type the table name first.",
  },
  staging: {
    label: "Staging",
    tone: "warn",
    hint: "Pre-production mirror. Safe to experiment, still shared with the team.",
  },
  development: {
    label: "Development",
    tone: "accent",
    hint: "Local or personal sandbox. No extra confirmations.",
  },
  other: {
    label: "Other",
    tone: "neutral",
    hint: "Anything that is not one of the above (demo, analytics replica, ...).",
  },
};

export const ENVIRONMENT_ORDER: ConnectionEnvironment[] = [
  "production",
  "staging",
  "development",
  "other",
];

export function isProduction(env: ConnectionEnvironment | null | undefined): boolean {
  return env === "production";
}
