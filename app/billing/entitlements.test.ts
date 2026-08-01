import { describe, expect, it } from "vitest";

import { decideEntitlement, PLAN_LIMITS } from "./entitlements";

describe("entitlement decisions", () => {
  it("keeps reads available after a downgrade", () => {
    expect(
      decideEntitlement("READ", {
        plan: "FREE",
        limits: PLAN_LIMITS.FREE,
        stale: true,
        activeCustomerCount: 20,
      }),
    ).toEqual({ allowed: true, reason: "allowed" });
  });

  it("fails closed for paid automation when billing truth is stale", () => {
    expect(
      decideEntitlement("RUN_REMINDER_AUTOMATION", {
        plan: "GROWTH",
        limits: PLAN_LIMITS.GROWTH,
        stale: true,
        activeCustomerCount: 10,
      }),
    ).toEqual({ allowed: false, reason: "snapshot_stale" });
  });

  it("uses the same active-customer limit for paid UI and worker actions", () => {
    const context = {
      plan: "STARTER" as const,
      limits: PLAN_LIMITS.STARTER,
      stale: false,
      activeCustomerCount: 51,
    };
    expect(
      decideEntitlement("ACTIVATE_REMINDER_AUTOMATION", context),
    ).toEqual({ allowed: false, reason: "active_customer_limit" });
    expect(decideEntitlement("RUN_REMINDER_AUTOMATION", context)).toEqual({
      allowed: false,
      reason: "active_customer_limit",
    });
  });

  it("requires a paid plan for reminder automation on free", () => {
    expect(
      decideEntitlement("ACTIVATE_REMINDER_AUTOMATION", {
        plan: "FREE",
        limits: PLAN_LIMITS.FREE,
        stale: false,
        activeCustomerCount: 3,
      }),
    ).toEqual({ allowed: false, reason: "paid_plan_required" });
  });
});
