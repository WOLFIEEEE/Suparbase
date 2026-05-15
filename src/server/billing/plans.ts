import "server-only";
import type { Plan, SubscriptionRow, SubscriptionStatus } from "@/server/schema";

/**
 * The catalog of plans and what each entitles you to. The Free tier
 * is the implicit default — a user with no `subscriptions` row, or a
 * row whose status has lapsed (cancelled/expired/on_hold/failed) is
 * resolved to `free` at entitlement time.
 */
export interface PlanLimits {
  /** Max number of personal connections (owned by this user). */
  maxConnections: number;
  /** Can this user invite teammates to their connections? */
  canInviteTeam: boolean;
  /** Display label shown in the UI. */
  label: string;
  /** One-line marketing description for billing UI. */
  description: string;
  /** Monthly price in cents (for MRR maths in /admin). */
  monthlyPriceCents: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxConnections: 1,
    canInviteTeam: false,
    label: "Free",
    description: "1 Supabase connection, solo workspace.",
    monthlyPriceCents: 0,
  },
  hosted: {
    maxConnections: Number.POSITIVE_INFINITY,
    canInviteTeam: true,
    label: "Hosted",
    description: "Unlimited connections, team workspace, 90-day audit retention.",
    monthlyPriceCents: 1200,
  },
  team: {
    maxConnections: Number.POSITIVE_INFINITY,
    canInviteTeam: true,
    label: "Team",
    description: "Custom enterprise plan — SSO, dedicated infra, DPA.",
    monthlyPriceCents: 0, // priced manually
  },
};

export type FeatureName = keyof Pick<PlanLimits, "canInviteTeam"> | "addConnection";

/**
 * Status values that grant access to the row's `plan` entitlement.
 * Everything else collapses to `free` regardless of what `plan` says.
 */
const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["trialing", "active"]);

export interface ActivePlan {
  plan: Plan;
  status: SubscriptionStatus;
  limits: PlanLimits;
  /** True when the user is on `hosted`/`team` via real billing or admin grant. */
  isPaid: boolean;
  /** True when the user is currently inside a free trial. */
  isTrialing: boolean;
  /** Optional renewal cliff used by the UI to render "Renews on Jan 14". */
  currentPeriodEnd: Date | null;
  /** Trial end cliff (only meaningful when isTrialing). */
  trialEndsAt: Date | null;
  /** Whether this entitlement came from a manual admin grant. */
  grantedByAdmin: boolean;
}

/**
 * Resolve a subscription row (or the absence of one) to the user's
 * current entitlement. Treats lapsed paid rows as free so a stale
 * `plan='hosted'` row doesn't accidentally keep someone entitled.
 */
export function resolvePlan(row: SubscriptionRow | null): ActivePlan {
  if (!row) {
    return {
      plan: "free",
      status: "none",
      limits: PLAN_LIMITS.free,
      isPaid: false,
      isTrialing: false,
      currentPeriodEnd: null,
      trialEndsAt: null,
      grantedByAdmin: false,
    };
  }
  const cliff = row.currentPeriodEnd ?? row.trialEndsAt;
  const cliffOk = cliff ? cliff.getTime() > Date.now() : false;
  const entitled =
    row.plan !== "free" &&
    ENTITLED_STATUSES.has(row.status) &&
    // Admin grants without a cliff are open-ended; real-billing rows
    // need a future period_end / trial_ends_at to count.
    (row.grantedByAdmin !== null || cliffOk);
  const effectivePlan: Plan = entitled ? row.plan : "free";
  return {
    plan: effectivePlan,
    status: row.status,
    limits: PLAN_LIMITS[effectivePlan],
    isPaid: entitled,
    isTrialing: entitled && row.status === "trialing",
    currentPeriodEnd: row.currentPeriodEnd,
    trialEndsAt: row.trialEndsAt,
    grantedByAdmin: row.grantedByAdmin !== null,
  };
}

export class PlanLimitError extends Error {
  constructor(
    public readonly feature: FeatureName,
    public readonly plan: Plan,
    message: string,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

/**
 * Throw if the active plan can't use `feature`. Routes catch this and
 * turn it into HTTP 402 with a paywall payload the UI can render.
 *
 * For `addConnection` the caller supplies the current connection
 * count so we don't have to re-query at every call site.
 */
export function requireFeature(
  active: ActivePlan,
  feature: FeatureName,
  ctx?: { currentConnectionCount?: number },
): void {
  if (feature === "canInviteTeam") {
    if (!active.limits.canInviteTeam) {
      throw new PlanLimitError(
        feature,
        active.plan,
        "Team invitations require the Hosted plan.",
      );
    }
    return;
  }
  if (feature === "addConnection") {
    const count = ctx?.currentConnectionCount ?? 0;
    if (count >= active.limits.maxConnections) {
      throw new PlanLimitError(
        feature,
        active.plan,
        `The Free plan is limited to ${active.limits.maxConnections} connection. Upgrade to add more.`,
      );
    }
    return;
  }
  // Should be unreachable; keep exhaustive for future features.
  const _exhaustive: never = feature;
  void _exhaustive;
}
