import prisma from "../db.server";
import { AuditRepository } from "./audit-repository.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export async function updateShopSettings(input: {
  shopDomain: string;
  timezone: string;
  completeOnboarding: boolean;
  actorId?: string;
  correlationId: string;
}): Promise<void> {
  const timezone = input.timezone.trim().slice(0, 100);
  if (!validTimezone(timezone)) throw new Error("Invalid IANA timezone");
  const shopDomain = normalizeShopDomain(input.shopDomain);
  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.shop.findUnique({
      where: { shopDomain },
    });
    if (!existing || existing.status !== "ACTIVE") {
      throw new Error("Shop not found");
    }
    const updated = await transaction.shop.update({
      where: { id: existing.id },
      data: {
        timezone,
        onboardingCompletedAt: input.completeOnboarding
          ? existing.onboardingCompletedAt ?? new Date()
          : existing.onboardingCompletedAt,
        settingsVersion: { increment: 1 },
      },
    });
    await new AuditRepository(transaction, existing.id).append({
      actorType: "MERCHANT",
      actorId: input.actorId,
      action: "settings.updated",
      targetType: "shop",
      targetId: existing.id,
      safeBefore: {
        timezone: existing.timezone,
        onboardingCompleted: Boolean(existing.onboardingCompletedAt),
      },
      safeAfter: {
        timezone: updated.timezone,
        onboardingCompleted: Boolean(updated.onboardingCompletedAt),
      },
      reason: "merchant_settings",
      correlationId: input.correlationId,
    });
  });
}
