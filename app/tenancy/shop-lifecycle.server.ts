import type { Session } from "@shopify/shopify-api";

import prisma from "../db.server";
import { AuditRepository } from "../operations/audit-repository.server";
import { normalizeShopDomain } from "./shop-domain";
import {
  InactiveShopError,
  ShopRepository,
} from "./shop-repository.server";
import {
  fingerprintScopes,
  hasRequiredScopes,
  normalizeScopes,
} from "./scope-policy";

type LifecycleInput = {
  shopDomain: string;
  correlationId: string;
};

export async function requireActiveShop(shopDomain: string): Promise<void> {
  const shop = await new ShopRepository(prisma).findByDomain(shopDomain);
  if (!shop) {
    throw new InactiveShopError();
  }

  await new ShopRepository(prisma).requireActiveById(shop.id);
}

export async function activateInstalledShop(
  session: Session,
  correlationId: string,
): Promise<void> {
  const shopDomain = normalizeShopDomain(session.shop);
  const scopes = normalizeScopes(session.scope);
  const scopesComplete = hasRequiredScopes(scopes);

  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.shop.findUnique({
      where: { shopDomain },
    });
    const isActivation = !existing || existing.status !== "ACTIVE";
    const shop = await transaction.shop.upsert({
      where: { shopDomain },
      create: {
        shopDomain,
        status: "ACTIVE",
        scopesComplete,
        globalRemindersPaused: true,
      },
      update: {
        status: "ACTIVE",
        scopesComplete,
        installedAt: isActivation ? new Date() : existing.installedAt,
        uninstalledAt: null,
        globalRemindersPaused: isActivation
          ? true
          : existing.globalRemindersPaused,
        version: { increment: 1 },
      },
    });

    await new AuditRepository(transaction, shop.id).append({
      actorType: "SHOPIFY",
      action: isActivation ? "shop.activated" : "shop.reauthenticated",
      targetType: "shop",
      targetId: shop.id,
      safeBefore: existing
        ? {
            status: existing.status,
            scopesComplete: existing.scopesComplete,
          }
        : undefined,
      safeAfter: {
        status: "ACTIVE",
        scopesComplete,
        remindersPaused: shop.globalRemindersPaused,
      },
      reason: isActivation ? "shopify_auth_completed" : "token_reauthenticated",
      correlationId,
    });
  });
}

export async function updateShopScopes(
  input: LifecycleInput & {
    scopes: readonly string[];
    sessionId?: string;
  },
): Promise<void> {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const scopes = normalizeScopes(input.scopes);
  const scopesComplete = hasRequiredScopes(scopes);

  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.shop.findUnique({
      where: { shopDomain },
    });
    if (!existing || existing.status !== "ACTIVE") return;

    const shop = await transaction.shop.update({
      where: { id: existing.id },
      data: {
        scopesComplete,
        globalRemindersPaused: scopesComplete
          ? existing.globalRemindersPaused
          : true,
        version: { increment: 1 },
      },
    });

    await transaction.session.updateMany({
      where: {
        shopId: shop.id,
        ...(input.sessionId ? { id: input.sessionId } : {}),
      },
      data: {
        scope: scopes.join(","),
        grantedScopeFingerprint:
          scopes.length > 0 ? fingerprintScopes(scopes) : null,
      },
    });

    await new AuditRepository(transaction, shop.id).append({
      actorType: "SHOPIFY",
      action: "shop.scopes_updated",
      targetType: "shop",
      targetId: shop.id,
      safeBefore: { scopesComplete: existing.scopesComplete },
      safeAfter: {
        scopesComplete,
        remindersPaused: shop.globalRemindersPaused,
      },
      reason: scopesComplete
        ? "required_scopes_present"
        : "required_scope_missing",
      correlationId: input.correlationId,
    });
  });
}

export async function uninstallShop(
  input: LifecycleInput,
): Promise<{ shopId: string; uninstalledAt: Date } | undefined> {
  const shopDomain = normalizeShopDomain(input.shopDomain);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.shop.findUnique({
      where: { shopDomain },
    });
    if (!existing) return undefined;
    if (existing.status === "UNINSTALLED") {
      await transaction.session.deleteMany({
        where: { shopId: existing.id },
      });
      return {
        shopId: existing.id,
        uninstalledAt: existing.uninstalledAt ?? new Date(),
      };
    }

    const shop = await transaction.shop.update({
      where: { id: existing.id },
      data: {
        status: "UNINSTALLED",
        uninstalledAt: new Date(),
        globalRemindersPaused: true,
        version: { increment: 1 },
      },
    });

    await transaction.session.deleteMany({
      where: { shopId: shop.id },
    });

    await new AuditRepository(transaction, shop.id).append({
      actorType: "SHOPIFY",
      action: "shop.uninstalled",
      targetType: "shop",
      targetId: shop.id,
      safeBefore: {
        status: existing.status,
        remindersPaused: existing.globalRemindersPaused,
      },
      safeAfter: {
        status: "UNINSTALLED",
        remindersPaused: true,
        sessionsRemoved: true,
      },
      reason: "app_uninstalled_webhook",
      correlationId: input.correlationId,
    });
    return { shopId: shop.id, uninstalledAt: shop.uninstalledAt ?? new Date() };
  });
}
