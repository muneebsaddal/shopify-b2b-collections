import prisma from "../db.server";
import { AuditRepository } from "../operations/audit-repository.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";

export async function setCompanyReminderSuppression(input: {
  shopDomain: string;
  companyId: string;
  suppressed: boolean;
  reasonCode: string;
  correlationId: string;
}): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: normalizeShopDomain(input.shopDomain) },
  });
  if (!shop || shop.status !== "ACTIVE") throw new Error("shop_inactive");
  const company = await prisma.company.findFirst({
    where: { id: input.companyId, shopId: shop.id },
  });
  if (!company) throw new Error("company_not_found");
  await prisma.$transaction(async (transaction) => {
    if (input.suppressed) {
      await transaction.companyReminderSuppression.upsert({
        where: {
          shopId_companyId: { shopId: shop.id, companyId: company.id },
        },
        create: {
          shopId: shop.id,
          companyId: company.id,
          reasonCode: input.reasonCode.slice(0, 80) || "merchant_suppression",
        },
        update: {
          reasonCode: input.reasonCode.slice(0, 80) || "merchant_suppression",
          activeAt: new Date(),
          expiresAt: null,
          releasedAt: null,
        },
      });
    } else {
      await transaction.companyReminderSuppression.updateMany({
        where: { shopId: shop.id, companyId: company.id, releasedAt: null },
        data: { releasedAt: new Date() },
      });
    }
    await transaction.collectionAction.create({
      data: {
        shopId: shop.id,
        companyId: company.id,
        type: "SUPPRESSION_CHANGED",
        safeSummary: input.suppressed
          ? "Company reminders suppressed"
          : "Company reminder suppression released",
      },
    });
    await new AuditRepository(transaction, shop.id).append({
      actorType: "MERCHANT",
      action: input.suppressed
        ? "reminder.company_suppressed"
        : "reminder.company_unsuppressed",
      targetType: "company",
      targetId: company.id,
      safeAfter: { suppressed: input.suppressed },
      reason: "merchant_safety_control",
      correlationId: input.correlationId,
    });
  });
}
