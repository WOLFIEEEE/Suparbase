import { describe, expect, it } from "vitest";
import { mapDodoEventToUpdate, mapStatus } from "@/server/billing/dodo-events";

/**
 * Pure mapping from a Dodo webhook event to a `subscriptions` row
 * update. The handler glues this to upsertSubscription + idempotency.
 * Pinning the event-name → status table here means we can't
 * accidentally regress the lifecycle handling without a red test.
 */

describe("mapStatus", () => {
  it("subscription.active without data.status → active", () => {
    expect(mapStatus("subscription.active", undefined)).toBe("active");
  });
  it("subscription.active with data.status=trialing → trialing", () => {
    expect(mapStatus("subscription.active", "trialing")).toBe("trialing");
  });
  it("subscription.renewed defaults to active", () => {
    expect(mapStatus("subscription.renewed", undefined)).toBe("active");
  });
  it("subscription.renewed honours trialing payload", () => {
    expect(mapStatus("subscription.renewed", "trialing")).toBe("trialing");
  });
  it("subscription.plan_changed → active/trialing per payload", () => {
    expect(mapStatus("subscription.plan_changed", undefined)).toBe("active");
    expect(mapStatus("subscription.plan_changed", "trialing")).toBe("trialing");
  });
  it("subscription.updated → active/trialing per payload", () => {
    expect(mapStatus("subscription.updated", undefined)).toBe("active");
    expect(mapStatus("subscription.updated", "trialing")).toBe("trialing");
  });
  it("subscription.on_hold → on_hold", () => {
    expect(mapStatus("subscription.on_hold", undefined)).toBe("on_hold");
  });
  it("subscription.cancelled → cancelled", () => {
    expect(mapStatus("subscription.cancelled", undefined)).toBe("cancelled");
  });
  it("subscription.expired → expired", () => {
    expect(mapStatus("subscription.expired", undefined)).toBe("expired");
  });
  it("subscription.failed → failed", () => {
    expect(mapStatus("subscription.failed", undefined)).toBe("failed");
  });
  it("unknown event → null (caller no-ops)", () => {
    expect(mapStatus("payment.refunded", undefined)).toBeNull();
    expect(mapStatus("", undefined)).toBeNull();
  });
});

describe("mapDodoEventToUpdate", () => {
  it("returns null for unrecognised event", () => {
    expect(mapDodoEventToUpdate({ type: "payment.refunded", data: {} })).toBeNull();
  });

  it("maps a typical active event into a hosted subscription update", () => {
    const update = mapDodoEventToUpdate({
      type: "subscription.active",
      data: {
        subscription_id: "sub_123",
        customer_id: "cus_abc",
        status: "active",
        current_period_end: "2027-01-01T00:00:00Z",
      },
    });
    expect(update).not.toBeNull();
    expect(update?.plan).toBe("hosted");
    expect(update?.status).toBe("active");
    expect(update?.dodoCustomerId).toBe("cus_abc");
    expect(update?.dodoSubscriptionId).toBe("sub_123");
    expect(update?.currentPeriodEnd?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("propagates trial_end into trialEndsAt for a trialing event", () => {
    const update = mapDodoEventToUpdate({
      type: "subscription.active",
      data: {
        subscription_id: "sub_t",
        status: "trialing",
        trial_end: "2026-06-01T00:00:00Z",
      },
    });
    expect(update?.status).toBe("trialing");
    expect(update?.trialEndsAt?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("nulls dates that don't parse instead of throwing", () => {
    const update = mapDodoEventToUpdate({
      type: "subscription.active",
      data: { subscription_id: "sub", current_period_end: "not-a-date" },
    });
    expect(update?.currentPeriodEnd).toBeNull();
  });

  it("plan is always 'hosted' (the only self-serve product) even on expire/cancel", () => {
    for (const eventType of ["subscription.cancelled", "subscription.expired", "subscription.failed"]) {
      const update = mapDodoEventToUpdate({ type: eventType, data: { subscription_id: "x" } });
      expect(update?.plan).toBe("hosted");
    }
  });
});
