/**
 * Scheduled Sentry scan cadences (hours). Shared by the PATCH validator,
 * the settings picker, and the cron route so the three can't drift.
 */
export const SENTRY_SCAN_INTERVALS = [6, 12, 24, 72, 168] as const;

export type SentryScanInterval = (typeof SENTRY_SCAN_INTERVALS)[number];

export const SENTRY_SCAN_INTERVAL_LABEL: Record<SentryScanInterval, string> = {
  6: "Every 6 hours",
  12: "Every 12 hours",
  24: "Daily",
  72: "Every 3 days",
  168: "Weekly",
};

export function isSentryScanInterval(n: number): n is SentryScanInterval {
  return (SENTRY_SCAN_INTERVALS as readonly number[]).includes(n);
}
