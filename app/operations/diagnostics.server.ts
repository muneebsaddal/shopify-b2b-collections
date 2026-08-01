import prisma from "../db.server";
import { entitlementForDomain } from "../billing/entitlement-service.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";

export type DiagnosticAlert = {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
};

export async function loadShopDiagnostics(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: normalizeShopDomain(shopDomain) },
    select: {
      id: true,
      shopDomain: true,
      status: true,
      timezone: true,
      scopesComplete: true,
      syncStatus: true,
      lastReconciledAt: true,
      globalRemindersPaused: true,
      onboardingCompletedAt: true,
    },
  });
  if (!shop) throw new Error("Shop not found");

  const [
    entitlement,
    failedSyncWork,
    failedWebhooks,
    expiringTokens,
    unknownDeliveries,
    failedDeliveries,
    overduePrivacy,
    safetyControls,
    replyToCount,
    policyCount,
  ] = await Promise.all([
    entitlementForDomain(shop.shopDomain),
    prisma.syncWorkItem.count({
      where: { shopId: shop.id, state: "FAILED" },
    }),
    prisma.webhookReceipt.count({
      where: { shopId: shop.id, state: "FAILED" },
    }),
    prisma.session.count({
      where: {
        shopId: shop.id,
        revokedAt: null,
        expires: { lte: new Date(Date.now() + 6 * 60 * 60 * 1000) },
      },
    }),
    prisma.reminderDelivery.count({
      where: { shopId: shop.id, state: "UNKNOWN" },
    }),
    prisma.reminderDelivery.count({
      where: { shopId: shop.id, state: "FAILED" },
    }),
    prisma.privacyRequest.count({
      where: {
        shopId: shop.id,
        state: { in: ["QUEUED", "FAILED"] },
        dueAt: { lt: new Date() },
      },
    }),
    prisma.safetyControl.findMany({
      where: { OR: [{ shopId: null }, { shopId: shop.id }] },
      select: {
        shopId: true,
        controlKey: true,
        blocked: true,
        reasonCode: true,
        updatedAt: true,
      },
      orderBy: [{ controlKey: "asc" }, { shopId: "asc" }],
    }),
    prisma.replyToVerification.count({
      where: { shopId: shop.id, state: "VERIFIED" },
    }),
    prisma.reminderPolicy.count({ where: { shopId: shop.id } }),
  ]);

  const alerts: DiagnosticAlert[] = [];
  if (shop.syncStatus === "FAILED" || failedSyncWork > 0) {
    alerts.push({
      severity: "critical",
      code: "sync_attention",
      message: "Shopify synchronization needs attention.",
    });
  }
  if (entitlement.stale) {
    alerts.push({
      severity: "warning",
      code: "billing_stale",
      message: "Billing verification is stale; paid-only changes are blocked.",
    });
  }
  if (unknownDeliveries > 0) {
    alerts.push({
      severity: "critical",
      code: "unknown_deliveries",
      message: "An ambiguous email submission requires provider evidence.",
    });
  }
  if (overduePrivacy > 0) {
    alerts.push({
      severity: "critical",
      code: "privacy_overdue",
      message: "A privacy request is past due.",
    });
  }
  if (expiringTokens > 0) {
    alerts.push({
      severity: "warning",
      code: "token_expiry",
      message: "A Shopify token expires within six hours.",
    });
  }

  return {
    shop,
    entitlement,
    onboarding: {
      synchronized: shop.syncStatus === "FRESH",
      billingChecked: !entitlement.stale,
      replyToVerified: replyToCount > 0,
      reminderPolicyCreated: policyCount > 0,
      completed: Boolean(shop.onboardingCompletedAt),
    },
    diagnostics: {
      failedSyncWork,
      failedWebhooks,
      expiringTokens,
      unknownDeliveries,
      failedDeliveries,
      overduePrivacy,
    },
    safetyControls,
    alerts,
  };
}
