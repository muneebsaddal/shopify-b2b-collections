export type PlanKey = "FREE" | "STARTER" | "GROWTH" | "SCALE";

export type PlanLimits = {
  activeCustomerLimit: number | null;
  reminderAutomation: boolean;
  csvExports: boolean;
  statements: boolean;
};

export type EntitlementAction =
  | "READ"
  | "ACTIVATE_REMINDER_AUTOMATION"
  | "RUN_REMINDER_AUTOMATION"
  | "EXPORT_CSV"
  | "GENERATE_STATEMENT";

export type EntitlementContext = {
  plan: PlanKey;
  limits: PlanLimits;
  stale: boolean;
  activeCustomerCount: number;
};

export type EntitlementDecision = {
  allowed: boolean;
  reason:
    | "allowed"
    | "snapshot_stale"
    | "paid_plan_required"
    | "active_customer_limit"
    | "feature_unavailable";
};

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  FREE: {
    activeCustomerLimit: 5,
    reminderAutomation: false,
    csvExports: true,
    statements: true,
  },
  STARTER: {
    activeCustomerLimit: 50,
    reminderAutomation: true,
    csvExports: true,
    statements: true,
  },
  GROWTH: {
    activeCustomerLimit: 250,
    reminderAutomation: true,
    csvExports: true,
    statements: true,
  },
  SCALE: {
    activeCustomerLimit: null,
    reminderAutomation: true,
    csvExports: true,
    statements: true,
  },
};

export function decideEntitlement(
  action: EntitlementAction,
  context: EntitlementContext,
): EntitlementDecision {
  if (action === "READ") return { allowed: true, reason: "allowed" };

  if (context.stale) {
    return { allowed: false, reason: "snapshot_stale" };
  }

  const customerLimit = context.limits.activeCustomerLimit;
  if (customerLimit !== null && context.activeCustomerCount > customerLimit) {
    return { allowed: false, reason: "active_customer_limit" };
  }

  if (
    (action === "ACTIVATE_REMINDER_AUTOMATION" ||
      action === "RUN_REMINDER_AUTOMATION") &&
    !context.limits.reminderAutomation
  ) {
    return {
      allowed: false,
      reason:
        context.plan === "FREE" ? "paid_plan_required" : "feature_unavailable",
    };
  }

  if (action === "EXPORT_CSV" && !context.limits.csvExports) {
    return { allowed: false, reason: "feature_unavailable" };
  }
  if (action === "GENERATE_STATEMENT" && !context.limits.statements) {
    return { allowed: false, reason: "feature_unavailable" };
  }

  return { allowed: true, reason: "allowed" };
}
