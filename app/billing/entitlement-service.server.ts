import type { EntitlementSnapshot, Prisma } from "@prisma/client";

import prisma from "../db.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";
import {
  decideEntitlement,
  PLAN_LIMITS,
  type EntitlementAction,
  type EntitlementDecision,
  type PlanKey,
  type PlanLimits,
} from "./entitlements";
import {
  PartnerApiAdapter,
  PartnerApiUnavailableError,
} from "./partner-api.server";

const SNAPSHOT_TTL_MS = 15 * 60 * 1000;

export class EntitlementDeniedError extends Error {
  constructor(readonly decision: EntitlementDecision) {
    super(`Entitlement denied: ${decision.reason}`);
  }
}

export type ResolvedEntitlement = {
  plan: PlanKey;
  limits: PlanLimits;
  stale: boolean;
  state: EntitlementSnapshot["state"];
  verifiedAt: Date;
  expiresAt: Date;
  source: string;
};

function configuredHandles(): Record<PlanKey, string[]> {
  return {
    FREE: [process.env.SHOPIFY_PLAN_HANDLE_FREE || "free"],
    STARTER: [process.env.SHOPIFY_PLAN_HANDLE_STARTER || "starter"],
    GROWTH: [process.env.SHOPIFY_PLAN_HANDLE_GROWTH || "growth"],
    SCALE: [
      process.env.SHOPIFY_PLAN_HANDLE_SCALE || "scale",
      process.env.SHOPIFY_PLAN_HANDLE_TEST || "private-test",
    ],
  };
}

export function planFromActiveHandles(
  handles: readonly string[],
): PlanKey | null {
  const normalized = new Set(handles.map((handle) => handle.toLowerCase()));
  const configured = configuredHandles();
  for (const plan of ["SCALE", "GROWTH", "STARTER", "FREE"] as const) {
    if (
      configured[plan].some((handle) => normalized.has(handle.toLowerCase()))
    ) {
      return plan;
    }
  }
  return null;
}

function limitsFromJson(value: Prisma.JsonValue): PlanLimits | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const limits = value as Record<string, unknown>;
  if (
    (typeof limits.activeCustomerLimit !== "number" &&
      limits.activeCustomerLimit !== null) ||
    typeof limits.reminderAutomation !== "boolean" ||
    typeof limits.csvExports !== "boolean" ||
    typeof limits.statements !== "boolean"
  ) {
    return null;
  }
  return limits as PlanLimits;
}

function resolveSnapshot(
  snapshot: EntitlementSnapshot,
  now: Date,
): ResolvedEntitlement {
  const plan = snapshot.planHandle as PlanKey;
  const limits =
    limitsFromJson(snapshot.limits) ?? PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
  return {
    plan: plan in PLAN_LIMITS ? plan : "FREE",
    limits,
    stale:
      snapshot.expiresAt <= now ||
      snapshot.state === "UNKNOWN" ||
      snapshot.state === "FROZEN" ||
      snapshot.state === "CANCELED",
    state: snapshot.state,
    verifiedAt: snapshot.verifiedAt,
    expiresAt: snapshot.expiresAt,
    source: snapshot.source,
  };
}

export async function refreshEntitlementSnapshot(
  shopId: string,
  adapter = new PartnerApiAdapter(),
  now = new Date(),
): Promise<ResolvedEntitlement> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, shopifyShopGid: true },
  });
  if (!shop) throw new Error("Shop not found");

  let plan: PlanKey = "FREE";
  let state: EntitlementSnapshot["state"] = "FREE";
  let subscriptionId: string | null = null;
  let source = "partner_api";
  let sourceObservedAt: Date | null = now;

  if (!shop.shopifyShopGid || !adapter.configured()) {
    source = "configuration_fallback";
    sourceObservedAt = null;
  } else {
    const subscription = await adapter.activeSubscription(shop.shopifyShopGid);
    if (subscription) {
      const mapped = planFromActiveHandles(subscription.activeItemHandles);
      if (!mapped) {
        state = "UNKNOWN";
        source = "partner_api_unmapped_plan";
      } else {
        plan = mapped;
        state = mapped === "FREE" ? "FREE" : "ACTIVE";
      }
      subscriptionId = subscription.legacySubscriptionId;
    }
  }

  const snapshot = await prisma.entitlementSnapshot.create({
    data: {
      shopId,
      planHandle: plan,
      subscriptionId,
      state,
      limits: PLAN_LIMITS[plan],
      source,
      sourceObservedAt,
      verifiedAt: now,
      expiresAt: new Date(now.getTime() + SNAPSHOT_TTL_MS),
    },
  });
  return resolveSnapshot(snapshot, now);
}

export async function getEntitlementForShop(
  shopId: string,
  options: { refresh?: boolean; now?: Date } = {},
): Promise<ResolvedEntitlement> {
  const now = options.now ?? new Date();
  const latest = await prisma.entitlementSnapshot.findFirst({
    where: { shopId },
    orderBy: { verifiedAt: "desc" },
  });
  if (latest && latest.expiresAt > now && !options.refresh) {
    return resolveSnapshot(latest, now);
  }
  try {
    return await refreshEntitlementSnapshot(
      shopId,
      new PartnerApiAdapter(),
      now,
    );
  } catch (error) {
    if (!(error instanceof PartnerApiUnavailableError) && !latest) throw error;
    if (latest) return { ...resolveSnapshot(latest, now), stale: true };
    throw error;
  }
}

export async function countActivePaymentTermCustomers(
  shopId: string,
): Promise<number> {
  return prisma.company.count({
    where: {
      shopId,
      status: "ACTIVE",
      receivables: {
        some: { shopId, status: "OPEN", outstandingAmount: { gt: 0 } },
      },
    },
  });
}

export async function entitlementDecisionForShop(
  shopId: string,
  action: EntitlementAction,
): Promise<EntitlementDecision> {
  const [entitlement, activeCustomerCount] = await Promise.all([
    getEntitlementForShop(shopId),
    countActivePaymentTermCustomers(shopId),
  ]);
  return decideEntitlement(action, {
    ...entitlement,
    activeCustomerCount,
  });
}

export async function requireEntitlement(
  shopId: string,
  action: EntitlementAction,
): Promise<void> {
  const decision = await entitlementDecisionForShop(shopId, action);
  if (!decision.allowed) throw new EntitlementDeniedError(decision);
}

export async function entitlementForDomain(
  shopDomain: string,
  options: { refresh?: boolean } = {},
) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: normalizeShopDomain(shopDomain) },
    select: { id: true },
  });
  if (!shop) throw new Error("Shop not found");
  const [entitlement, activeCustomerCount] = await Promise.all([
    getEntitlementForShop(shop.id, options),
    countActivePaymentTermCustomers(shop.id),
  ]);
  return {
    ...entitlement,
    activeCustomerCount,
    decision: decideEntitlement("ACTIVATE_REMINDER_AUTOMATION", {
      ...entitlement,
      activeCustomerCount,
    }),
  };
}
