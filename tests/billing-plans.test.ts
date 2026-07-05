import { describe, expect, it } from "vitest";
import {
  PlanLimitError,
  PLAN_LIMITS,
  requireFeature,
  resolvePlan,
} from "@/server/billing/plans";
import type { SubscriptionRow } from "@/server/schema";

/**
 * Plan resolver + entitlement checks. The resolver collapses every
 * "post-payment" status (cancelled, expired, on_hold, failed) to the
 * free entitlement so a stale paid row doesn't accidentally let
 * someone keep extras.
 */

const baseRow: SubscriptionRow = {
  userId: "u1",
  plan: "hosted",
  status: "active",
  dodoCustomerId: null,
  dodoSubscriptionId: null,
  currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  trialEndsAt: null,
  grantedByAdmin: null,
  grantedAt: null,
  adminNote: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("resolvePlan", () => {
  it("treats a missing row as Free", () => {
    const r = resolvePlan(null);
    expect(r.plan).toBe("free");
    expect(r.isPaid).toBe(false);
    expect(r.limits.maxConnections).toBe(3);
    expect(r.limits.canInviteTeam).toBe(false);
  });

  it("entitles an active hosted subscription", () => {
    const r = resolvePlan(baseRow);
    expect(r.plan).toBe("hosted");
    expect(r.isPaid).toBe(true);
    expect(r.limits.canInviteTeam).toBe(true);
  });

  it("entitles a trialing subscription", () => {
    const r = resolvePlan({ ...baseRow, status: "trialing" });
    expect(r.isPaid).toBe(true);
    expect(r.isTrialing).toBe(true);
  });

  it("does NOT entitle a cancelled subscription", () => {
    const r = resolvePlan({ ...baseRow, status: "cancelled" });
    expect(r.plan).toBe("free");
    expect(r.isPaid).toBe(false);
  });

  it("does NOT entitle an expired subscription", () => {
    const r = resolvePlan({ ...baseRow, status: "expired" });
    expect(r.plan).toBe("free");
  });

  it("does NOT entitle an on_hold subscription", () => {
    const r = resolvePlan({ ...baseRow, status: "on_hold" });
    expect(r.plan).toBe("free");
  });

  it("does NOT entitle when the current period has elapsed", () => {
    const r = resolvePlan({
      ...baseRow,
      currentPeriodEnd: new Date(Date.now() - 1_000),
    });
    expect(r.plan).toBe("free");
  });

  it("does entitle an admin-granted row without a cliff (open-ended)", () => {
    const r = resolvePlan({
      ...baseRow,
      currentPeriodEnd: null,
      trialEndsAt: null,
      grantedByAdmin: "admin-1",
    });
    expect(r.isPaid).toBe(true);
    expect(r.grantedByAdmin).toBe(true);
  });

  // Regression guard for the v3.4.1 bug where an admin grant
  // silently outlived its own `expiresAt` because the cliff check
  // was OR'd with the admin flag.
  it("admin grant WITH an elapsed cliff is NOT entitled", () => {
    const r = resolvePlan({
      ...baseRow,
      currentPeriodEnd: new Date(Date.now() - 1000), // expired 1s ago
      trialEndsAt: null,
      grantedByAdmin: "admin-1",
    });
    expect(r.isPaid).toBe(false);
    expect(r.plan).toBe("free");
  });

  it("admin grant with a future cliff IS entitled", () => {
    const r = resolvePlan({
      ...baseRow,
      currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      trialEndsAt: null,
      grantedByAdmin: "admin-1",
    });
    expect(r.isPaid).toBe(true);
    expect(r.grantedByAdmin).toBe(true);
  });
});

describe("requireFeature", () => {
  it("Free tier allows up to 3 connections, rejects the 4th", () => {
    const r = resolvePlan(null);
    expect(() =>
      requireFeature(r, "addConnection", { currentConnectionCount: 2 }),
    ).not.toThrow();
    expect(() =>
      requireFeature(r, "addConnection", { currentConnectionCount: 3 }),
    ).toThrow(PlanLimitError);
  });

  it("Free tier rejects team invites", () => {
    const r = resolvePlan(null);
    expect(() => requireFeature(r, "canInviteTeam")).toThrow(PlanLimitError);
  });

  it("Hosted tier accepts any connection count", () => {
    const r = resolvePlan(baseRow);
    expect(() =>
      requireFeature(r, "addConnection", { currentConnectionCount: 99 }),
    ).not.toThrow();
  });

  it("Hosted tier accepts team invites", () => {
    const r = resolvePlan(baseRow);
    expect(() => requireFeature(r, "canInviteTeam")).not.toThrow();
  });
});

describe("PLAN_LIMITS catalog", () => {
  it("Free has finite connection limit + no team", () => {
    expect(PLAN_LIMITS.free.maxConnections).toBe(3);
    expect(PLAN_LIMITS.free.canInviteTeam).toBe(false);
  });
  // null === unlimited (chosen over Number.POSITIVE_INFINITY so
  // JSON serialisation to the client component stays correct).
  it("Hosted has unlimited connections + team", () => {
    expect(PLAN_LIMITS.hosted.maxConnections).toBeNull();
    expect(PLAN_LIMITS.hosted.canInviteTeam).toBe(true);
  });
  it("Team has unlimited connections", () => {
    expect(PLAN_LIMITS.team.maxConnections).toBeNull();
  });
  it("Hosted price is $12/mo in cents", () => {
    expect(PLAN_LIMITS.hosted.monthlyPriceCents).toBe(1200);
  });
  it("Hosted trial is 7 days", () => {
    expect(PLAN_LIMITS.hosted.trialDays).toBe(7);
  });

  it("requireFeature treats null max as unlimited", () => {
    const r = resolvePlan(baseRow);
    expect(() =>
      requireFeature(r, "addConnection", { currentConnectionCount: 9999 }),
    ).not.toThrow();
  });
});
