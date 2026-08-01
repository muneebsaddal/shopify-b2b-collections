import { createHmac } from "node:crypto";

import type { PrivacyRequestType } from "@prisma/client";

import prisma from "../db.server";
import { AuditRepository } from "../operations/audit-repository.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";
import { parsePrivacyPayload } from "./privacy-payload";

const CUSTOMER_REQUEST_DUE_MS = 30 * 24 * 60 * 60 * 1000;
const UNINSTALL_RETENTION_MS = 48 * 60 * 60 * 1000;

function tombstoneKey(): string {
  const key =
    process.env.PRIVACY_TOMBSTONE_KEY ?? process.env.SESSION_ENCRYPTION_KEY;
  if (!key) throw new Error("PRIVACY_TOMBSTONE_KEY is required");
  return key;
}

function privacyHash(context: string, value: string): string {
  return createHmac("sha256", tombstoneKey())
    .update(`${context}:${value}`)
    .digest("hex");
}

function requestDueAt(type: PrivacyRequestType, now: Date): Date {
  if (type === "CUSTOMER_DATA" || type === "CUSTOMER_REDACT") {
    return new Date(now.getTime() + CUSTOMER_REQUEST_DUE_MS);
  }
  if (type === "UNINSTALL_CLEANUP") {
    return new Date(now.getTime() + UNINSTALL_RETENTION_MS);
  }
  return now;
}

export async function acceptPrivacyWebhook(input: {
  shopDomain: string;
  type: Exclude<PrivacyRequestType, "UNINSTALL_CLEANUP">;
  payload: unknown;
  webhookId: string;
  correlationId: string;
  now?: Date;
}): Promise<{ requestId: string; duplicate: boolean } | null> {
  const now = input.now ?? new Date();
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const parsed = parsePrivacyPayload(input.type, input.payload);
  const externalRequestId =
    parsed.externalRequestId ?? `webhook:${input.webhookId.slice(0, 255)}`;

  return prisma.$transaction(async (transaction) => {
    const shop = await transaction.shop.findUnique({ where: { shopDomain } });
    if (!shop) {
      if (input.type === "SHOP_REDACT") {
        await transaction.deletionTombstone.upsert({
          where: { scopeKey: `shop:${privacyHash("shop", shopDomain)}` },
          create: {
            scopeKey: `shop:${privacyHash("shop", shopDomain)}`,
            shopDomainHash: privacyHash("shop", shopDomain),
            requestType: "SHOP_REDACT",
            requestedAt: now,
          },
          update: { completedAt: now },
        });
      }
      return null;
    }

    const existing = await transaction.privacyRequest.findUnique({
      where: {
        shopId_externalRequestId: {
          shopId: shop.id,
          externalRequestId,
        },
      },
      select: { id: true },
    });
    if (existing) return { requestId: existing.id, duplicate: true };

    const request = await transaction.privacyRequest.create({
      data: {
        shopId: shop.id,
        externalRequestId,
        type: input.type,
        subjectShopifyCustomerGid: parsed.customerGid,
        subjectShopifyOrderGids: parsed.orderGids,
        dueAt: requestDueAt(input.type, now),
      },
    });
    await new AuditRepository(transaction, shop.id).append({
      actorType: "SHOPIFY",
      action: "privacy.request_accepted",
      targetType: "privacy_request",
      targetId: request.id,
      safeAfter: {
        type: input.type,
        hasCustomerSubject: Boolean(parsed.customerGid),
        orderSubjectCount: parsed.orderGids.length,
      },
      reason: "mandatory_compliance_webhook",
      correlationId: input.correlationId,
    });
    return { requestId: request.id, duplicate: false };
  });
}

export async function scheduleUninstallCleanup(
  input: {
    shopId: string;
    uninstalledAt: Date;
    correlationId: string;
  },
): Promise<string> {
  return prisma.$transaction(async (transaction) => {
    const externalRequestId = `uninstall:${input.uninstalledAt.toISOString()}`;
    const request = await transaction.privacyRequest.upsert({
      where: {
        shopId_externalRequestId: {
          shopId: input.shopId,
          externalRequestId,
        },
      },
      create: {
        shopId: input.shopId,
        externalRequestId,
        type: "UNINSTALL_CLEANUP",
        dueAt: requestDueAt("UNINSTALL_CLEANUP", input.uninstalledAt),
      },
      update: {},
    });
    await new AuditRepository(transaction, input.shopId).append({
      actorType: "SYSTEM",
      action: "privacy.uninstall_cleanup_scheduled",
      targetType: "privacy_request",
      targetId: request.id,
      safeAfter: { dueAt: request.dueAt.toISOString() },
      reason: "uninstall_retention_schedule",
      correlationId: input.correlationId,
    });
    return request.id;
  });
}

async function completeDataInventory(
  request: {
    id: string;
    shopId: string;
    subjectShopifyCustomerGid: string | null;
    subjectShopifyOrderGids: string[];
  },
  correlationId: string,
): Promise<void> {
  const customerFilter = request.subjectShopifyCustomerGid
    ? { shopifyCustomerGid: request.subjectShopifyCustomerGid }
    : { id: "__missing_subject__" };
  const orderFilter =
    request.subjectShopifyOrderGids.length > 0
      ? { shopifyOrderGid: { in: request.subjectShopifyOrderGids } }
      : { id: "__missing_orders__" };
  const [contactCount, orderCount] = await Promise.all([
    prisma.companyContact.count({
      where: { shopId: request.shopId, ...customerFilter },
    }),
    prisma.receivable.count({
      where: { shopId: request.shopId, ...orderFilter },
    }),
  ]);
  await prisma.$transaction(async (transaction) => {
    await transaction.privacyRequest.update({
      where: { id: request.id },
      data: {
        state: "COMPLETED",
        evidenceReference: `inventory:v1:contacts=${contactCount};orders=${orderCount}`,
        completedAt: new Date(),
        errorCode: null,
      },
    });
    await new AuditRepository(transaction, request.shopId).append({
      actorType: "WORKER",
      action: "privacy.customer_data_inventory_completed",
      targetType: "privacy_request",
      targetId: request.id,
      safeAfter: { contactCount, orderCount },
      reason: "customer_data_request",
      correlationId,
    });
  });
}

async function redactCustomer(
  request: {
    id: string;
    shopId: string;
    subjectShopifyCustomerGid: string | null;
    subjectShopifyOrderGids: string[];
    createdAt: Date;
  },
  correlationId: string,
): Promise<void> {
  if (!request.subjectShopifyCustomerGid) {
    throw new Error("privacy_customer_subject_missing");
  }
  const customerGid = request.subjectShopifyCustomerGid;
  await prisma.$transaction(async (transaction) => {
    const contacts = await transaction.companyContact.findMany({
      where: {
        shopId: request.shopId,
        shopifyCustomerGid: customerGid,
      },
      select: { id: true, companyId: true, emailHmac: true },
    });
    const contactIds = contacts.map((contact) => contact.id);
    const companyIds = [...new Set(contacts.map((contact) => contact.companyId))];

    for (const contact of contacts) {
      if (!contact.emailHmac) continue;
      const existingSuppression = await transaction.recipientSuppression.findFirst({
        where: {
          shopId: request.shopId,
          emailHmac: contact.emailHmac,
          source: "PRIVACY",
          releasedAt: null,
        },
        select: { id: true },
      });
      if (!existingSuppression) {
        await transaction.recipientSuppression.create({
          data: {
            shopId: request.shopId,
            emailHmac: contact.emailHmac,
            companyContactId: contact.id,
            companyId: contact.companyId,
            source: "PRIVACY",
            reasonCode: "customer_redaction",
          },
        });
      }
    }

    if (contactIds.length > 0) {
      await transaction.reminderDelivery.updateMany({
        where: { shopId: request.shopId, companyContactId: { in: contactIds } },
        data: {
          encryptedRecipient: null,
          encryptedSubject: null,
          encryptedBody: null,
        },
      });
      await transaction.companyContact.updateMany({
        where: { shopId: request.shopId, id: { in: contactIds } },
        data: {
          encryptedEmail: null,
          emailHmac: null,
          emailValid: false,
          shopifyCustomerGid: null,
          status: "REDACTED",
          redactedAt: new Date(),
        },
      });
    }

    if (companyIds.length > 0) {
      await Promise.all([
        transaction.collectionAction.deleteMany({
          where: { shopId: request.shopId, companyId: { in: companyIds } },
        }),
        transaction.collectionNote.deleteMany({
          where: { shopId: request.shopId, companyId: { in: companyIds } },
        }),
        transaction.promiseToPay.deleteMany({
          where: { shopId: request.shopId, companyId: { in: companyIds } },
        }),
        transaction.reliabilitySnapshot.deleteMany({
          where: { shopId: request.shopId, companyId: { in: companyIds } },
        }),
      ]);
      for (const companyId of companyIds) {
        const activeContacts = await transaction.companyContact.count({
          where: { shopId: request.shopId, companyId, status: "ACTIVE" },
        });
        if (activeContacts === 0) {
          await transaction.company.updateMany({
            where: { id: companyId, shopId: request.shopId },
            data: { displayName: "[redacted]", status: "REDACTED" },
          });
          await transaction.companyLocation.updateMany({
            where: { companyId, shopId: request.shopId },
            data: { displayLabel: null, status: "REDACTED" },
          });
        }
      }
    }

    if (request.subjectShopifyOrderGids.length > 0) {
      await transaction.receivable.updateMany({
        where: {
          shopId: request.shopId,
          shopifyOrderGid: { in: request.subjectShopifyOrderGids },
        },
        data: { orderName: "[redacted]" },
      });
    }

    const subjectHash = privacyHash("customer", customerGid);
    await transaction.deletionTombstone.upsert({
      where: {
        scopeKey: `customer:${request.shopId}:${subjectHash}`,
      },
      create: {
        scopeKey: `customer:${request.shopId}:${subjectHash}`,
        shopId: request.shopId,
        shopDomainHash: privacyHash("shop-id", request.shopId),
        requestType: "CUSTOMER_REDACT",
        subjectHash,
        requestedAt: request.createdAt,
      },
      update: { completedAt: new Date() },
    });
    await transaction.privacyRequest.update({
      where: { id: request.id },
      data: {
        state: "COMPLETED",
        evidenceReference: `redaction:v1:contacts=${contactIds.length}`,
        completedAt: new Date(),
        errorCode: null,
        subjectShopifyCustomerGid: null,
        subjectShopifyOrderGids: [],
      },
    });
    await new AuditRepository(transaction, request.shopId).append({
      actorType: "WORKER",
      action: "privacy.customer_redaction_completed",
      targetType: "privacy_request",
      targetId: request.id,
      safeAfter: {
        contactCount: contactIds.length,
        companyCount: companyIds.length,
      },
      reason: "customer_redaction_request",
      correlationId,
    });
  });
}

async function purgeShop(
  request: {
    id: string;
    shopId: string;
    type: PrivacyRequestType;
    createdAt: Date;
  },
): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    const shop = await transaction.shop.findUnique({
      where: { id: request.shopId },
      select: { shopDomain: true },
    });
    if (!shop) return;
    const shopDomainHash = privacyHash("shop", shop.shopDomain);
    await transaction.deletionTombstone.upsert({
      where: { scopeKey: `shop:${shopDomainHash}` },
      create: {
        scopeKey: `shop:${shopDomainHash}`,
        shopId: request.shopId,
        shopDomainHash,
        requestType: request.type,
        requestedAt: request.createdAt,
      },
      update: { completedAt: new Date(), requestType: request.type },
    });
    await transaction.shop.delete({ where: { id: request.shopId } });
  });
}

export async function processPrivacyRequest(
  requestId: string,
  correlationId: string,
): Promise<void> {
  const claimed = await prisma.privacyRequest.updateMany({
    where: {
      id: requestId,
      state: { in: ["QUEUED", "FAILED"] },
      attempts: { lt: 5 },
    },
    data: {
      state: "PROCESSING",
      attempts: { increment: 1 },
      errorCode: null,
    },
  });
  if (claimed.count !== 1) return;
  const request = await prisma.privacyRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return;
  try {
    if (request.type === "CUSTOMER_DATA") {
      await completeDataInventory(request, correlationId);
    } else if (request.type === "CUSTOMER_REDACT") {
      await redactCustomer(request, correlationId);
    } else {
      await purgeShop(request);
    }
  } catch {
    await prisma.privacyRequest.updateMany({
      where: { id: requestId },
      data: { state: "FAILED", errorCode: "privacy_processing_failed" },
    });
    throw new Error("Privacy request processing failed");
  }
}

export async function replayDeletionTombstones(): Promise<number> {
  const [shopTombstones, customerTombstones, shops] = await Promise.all([
    prisma.deletionTombstone.findMany({
      where: { requestType: { in: ["SHOP_REDACT", "UNINSTALL_CLEANUP"] } },
      select: { shopId: true, shopDomainHash: true },
    }),
    prisma.deletionTombstone.findMany({
      where: { requestType: "CUSTOMER_REDACT", shopId: { not: null } },
      select: { shopId: true, subjectHash: true },
    }),
    prisma.shop.findMany({ select: { id: true, shopDomain: true } }),
  ]);
  const shopIds = new Set(
    shopTombstones.flatMap((item) =>
      item.shopId ? [item.shopId] : [],
    ),
  );
  const domainHashes = new Set(
    shopTombstones.map((item) => item.shopDomainHash),
  );
  for (const shop of shops) {
    if (domainHashes.has(privacyHash("shop", shop.shopDomain))) {
      shopIds.add(shop.id);
    }
  }
  const shopPurges =
    shopIds.size > 0
      ? await prisma.shop.deleteMany({ where: { id: { in: [...shopIds] } } })
      : { count: 0 };

  let customerRedactions = 0;
  for (const tombstone of customerTombstones) {
    if (!tombstone.shopId || !tombstone.subjectHash || shopIds.has(tombstone.shopId))
      continue;
    const contacts = await prisma.companyContact.findMany({
      where: { shopId: tombstone.shopId, shopifyCustomerGid: { not: null } },
      select: { id: true, shopifyCustomerGid: true },
    });
    const ids = contacts.flatMap((contact) =>
      contact.shopifyCustomerGid &&
      privacyHash("customer", contact.shopifyCustomerGid) ===
        tombstone.subjectHash
        ? [contact.id]
        : [],
    );
    if (ids.length > 0) {
      const updated = await prisma.companyContact.updateMany({
        where: { shopId: tombstone.shopId, id: { in: ids } },
        data: {
          encryptedEmail: null,
          emailHmac: null,
          emailValid: false,
          shopifyCustomerGid: null,
          status: "REDACTED",
          redactedAt: new Date(),
        },
      });
      customerRedactions += updated.count;
    }
  }
  return shopPurges.count + customerRedactions;
}

export async function countDeletionTombstoneConflicts(): Promise<number> {
  const [shopTombstones, customerTombstones, shops] = await Promise.all([
    prisma.deletionTombstone.findMany({
      where: { requestType: { in: ["SHOP_REDACT", "UNINSTALL_CLEANUP"] } },
      select: { shopId: true, shopDomainHash: true },
    }),
    prisma.deletionTombstone.findMany({
      where: { requestType: "CUSTOMER_REDACT", shopId: { not: null } },
      select: { shopId: true, subjectHash: true },
    }),
    prisma.shop.findMany({ select: { id: true, shopDomain: true } }),
  ]);

  const deletedShopIds = new Set(
    shopTombstones.flatMap((item) => (item.shopId ? [item.shopId] : [])),
  );
  const deletedDomainHashes = new Set(
    shopTombstones.map((item) => item.shopDomainHash),
  );
  let conflicts = shops.filter(
    (shop) =>
      deletedShopIds.has(shop.id) ||
      deletedDomainHashes.has(privacyHash("shop", shop.shopDomain)),
  ).length;

  for (const tombstone of customerTombstones) {
    if (!tombstone.shopId || !tombstone.subjectHash) continue;
    const contacts = await prisma.companyContact.findMany({
      where: { shopId: tombstone.shopId, shopifyCustomerGid: { not: null } },
      select: { shopifyCustomerGid: true },
    });
    conflicts += contacts.filter(
      (contact) =>
        contact.shopifyCustomerGid &&
        privacyHash("customer", contact.shopifyCustomerGid) ===
          tombstone.subjectHash,
    ).length;
  }

  return conflicts;
}
