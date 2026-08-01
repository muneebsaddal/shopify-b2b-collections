import { randomUUID } from "node:crypto";

import type { PostmarkAdapter } from "../reminders/postmark-adapter.server";
import { afterAll, describe, expect, it, vi } from "vitest";

import prisma from "../db.server";
import { PgBossJobAdapter } from "./jobs/pg-boss-adapter.server";
import {
  acceptPrivacyWebhook,
  countDeletionTombstoneConflicts,
  processPrivacyRequest,
  replayDeletionTombstones,
} from "../privacy/privacy-service.server";
import { projectOrders } from "../sync/shopify-projection.server";
import { acceptSyncWebhook } from "../sync/webhook-intake.server";

const runPrefix = `stage4-${randomUUID().slice(0, 8)}`;
const createdShopIds = new Set<string>();

async function reminderService() {
  process.env.SHOPIFY_APP_URL ??= "https://stage4.example.test";
  process.env.SHOPIFY_API_KEY ??= "stage4-api-key";
  process.env.SHOPIFY_API_SECRET ??= "stage4-api-secret";
  process.env.SCOPES ??=
    "read_all_orders,read_customers,read_orders,read_payment_terms";
  return import("../reminders/delivery-service.server");
}

function domain(label: string): string {
  return `${runPrefix}-${label}.myshopify.com`;
}

async function createShop(label: string) {
  const shop = await prisma.shop.create({
    data: {
      shopDomain: domain(label),
      status: "ACTIVE",
      scopesComplete: true,
      syncStatus: "FRESH",
      globalRemindersPaused: false,
    },
  });
  createdShopIds.add(shop.id);
  return shop;
}

async function createCompanyReceivable(
  shopId: string,
  label: string,
  dueAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000),
) {
  const company = await prisma.company.create({
    data: {
      shopId,
      shopifyCompanyGid: `gid://shopify/Company/${runPrefix}-${label}`,
      displayName: `Stage 4 ${label}`,
    },
  });
  const receivable = await prisma.receivable.create({
    data: {
      shopId,
      companyId: company.id,
      shopifyOrderGid: `gid://shopify/Order/${runPrefix}-${label}`,
      orderName: `#${label}`,
      originalTotal: "100.00",
      outstandingAmount: "50.00",
      currency: "USD",
      status: "OPEN",
      dueAt,
      shopifyUpdatedAt: new Date("2026-07-31T12:00:00.000Z"),
    },
  });
  return { company, receivable };
}

async function createReminderFixture(label: string) {
  const shop = await createShop(label);
  const { company, receivable } = await createCompanyReceivable(shop.id, label);
  const contact = await prisma.companyContact.create({
    data: {
      shopId: shop.id,
      companyId: company.id,
      shopifyContactGid: `gid://shopify/CompanyContact/${runPrefix}-${label}`,
      encryptedEmail: "opaque-test-ciphertext",
      emailHmac: `hmac-${runPrefix}-${label}`,
      emailValid: true,
      isDefault: true,
    },
  });
  const verification = await prisma.replyToVerification.create({
    data: {
      shopId: shop.id,
      email: `${runPrefix}-${label}@merchant.example.test`,
      tokenHash: `token-${runPrefix}-${label}`,
      state: "VERIFIED",
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    },
  });
  const policy = await prisma.reminderPolicy.create({
    data: {
      shopId: shop.id,
      name: `Stage 4 ${label}`,
      state: "DRAFT",
      timezone: "UTC",
    },
  });
  const version = await prisma.reminderPolicyVersion.create({
    data: {
      shopId: shop.id,
      reminderPolicyId: policy.id,
      versionNumber: 1,
      senderDisplayName: "Stage 4 merchant",
      replyToVerificationId: verification.id,
      previewedAt: new Date(),
      approvedAt: new Date(),
    },
  });
  const stage = await prisma.reminderPolicyStage.create({
    data: {
      shopId: shop.id,
      reminderPolicyVersionId: version.id,
      stageKey: "overdue-1",
      offsetDays: 1,
      sortOrder: 1,
      subjectTemplate: "Reminder for {{orderName}}",
      encryptedBodyTemplate: "opaque-test-ciphertext",
    },
  });
  await prisma.reminderPolicy.update({
    where: { id: policy.id },
    data: {
      state: "ACTIVE",
      activeVersionId: version.id,
      approvedAt: new Date(),
    },
  });
  return { shop, company, receivable, contact, version, stage };
}

afterAll(async () => {
  const shopIds = [...createdShopIds];
  if (shopIds.length > 0) {
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } });
    await prisma.deletionTombstone.deleteMany({
      where: { shopId: { in: shopIds } },
    });
  }
  await prisma.$disconnect();
});

describe("Stage 4 PostgreSQL integration", () => {
  it("rejects cross-shop collection relationships at the database boundary", async () => {
    const shopA = await createShop("tenant-a");
    const shopB = await createShop("tenant-b");
    const a = await createCompanyReceivable(shopA.id, "tenant-a");
    const b = await createCompanyReceivable(shopB.id, "tenant-b");

    await expect(
      prisma.collectionNote.create({
        data: {
          shopId: shopA.id,
          companyId: b.company.id,
          receivableId: b.receivable.id,
          type: "INTERNAL",
          encryptedBody: "opaque-test-ciphertext",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.promiseToPay.create({
        data: {
          shopId: shopA.id,
          companyId: a.company.id,
          receivableId: b.receivable.id,
          promisedAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects same-shop deliveries that mix a receivable with another company's contact", async () => {
    const fixture = await createReminderFixture("delivery-relations");
    const otherCompany = await prisma.company.create({
      data: {
        shopId: fixture.shop.id,
        shopifyCompanyGid: `gid://shopify/Company/${runPrefix}-other`,
        displayName: "Other company",
      },
    });
    const otherContact = await prisma.companyContact.create({
      data: {
        shopId: fixture.shop.id,
        companyId: otherCompany.id,
        shopifyContactGid: `gid://shopify/CompanyContact/${runPrefix}-other`,
        encryptedEmail: "opaque-test-ciphertext",
        emailHmac: `hmac-${runPrefix}-other`,
        emailValid: true,
      },
    });

    await expect(
      prisma.reminderDelivery.create({
        data: {
          shopId: fixture.shop.id,
          receivableId: fixture.receivable.id,
          companyContactId: otherContact.id,
          reminderPolicyVersionId: fixture.version.id,
          reminderPolicyStageId: fixture.stage.id,
          reservationKey: `reservation-${runPrefix}-mismatch`,
          scheduledAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("deduplicates concurrent Shopify webhook deliveries into one receipt and work item", async () => {
    const shop = await createShop("webhook-race");
    const input = {
      shopDomain: shop.shopDomain,
      topic: "orders/updated",
      payload: { admin_graphql_api_id: "gid://shopify/Order/9001" },
      headers: {
        webhookId: `webhook-${runPrefix}`,
        eventId: `event-${runPrefix}`,
        apiVersion: "2026-07",
      },
      correlationId: `correlation-${runPrefix}`,
    };

    const results = await Promise.all(
      Array.from({ length: 6 }, () => acceptSyncWebhook(input)),
    );
    expect(results.every(Boolean)).toBe(true);
    expect(new Set(results.map((result) => result?.workItemId)).size).toBe(1);
    await expect(
      prisma.webhookReceipt.count({ where: { shopId: shop.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.syncWorkItem.count({ where: { shopId: shop.id } }),
    ).resolves.toBe(1);
  });

  it("ignores a delayed Shopify projection older than the recorded source version", async () => {
    const shop = await createShop("out-of-order");
    const { company } = await createCompanyReceivable(
      shop.id,
      "projection-parent",
    );
    await prisma.receivable.deleteMany({
      where: { shopId: shop.id, companyId: company.id },
    });
    const order = (updatedAt: string, amount: string) => ({
      id: `gid://shopify/Order/${runPrefix}-projection`,
      name: "#projection",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt,
      totalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
      totalOutstandingSet: { shopMoney: { amount, currencyCode: "USD" } },
      totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
      purchasingEntity: { company: { id: company.shopifyCompanyGid } },
      paymentTerms: {
        paymentTermsType: "NET_30",
        paymentSchedules: {
          pageInfo: { hasNextPage: false },
          nodes: [
            {
              id: `gid://shopify/PaymentSchedule/${runPrefix}`,
              balanceDue: { amount, currencyCode: "USD" },
              totalBalance: { amount: "100.00", currencyCode: "USD" },
              dueAt: "2026-07-30T00:00:00.000Z",
            },
          ],
        },
      },
    });

    await projectOrders(prisma, {
      shopId: shop.id,
      timezone: "UTC",
      nodes: [order("2026-07-31T12:00:00.000Z", "50.00")],
      observedAt: new Date("2026-07-31T12:05:00.000Z"),
      correlationId: `latest-${runPrefix}`,
    });
    await projectOrders(prisma, {
      shopId: shop.id,
      timezone: "UTC",
      nodes: [order("2026-07-30T12:00:00.000Z", "100.00")],
      observedAt: new Date("2026-07-31T12:06:00.000Z"),
      correlationId: `delayed-${runPrefix}`,
    });

    const saved = await prisma.receivable.findUnique({
      where: {
        shopId_shopifyOrderGid: {
          shopId: shop.id,
          shopifyOrderGid: `gid://shopify/Order/${runPrefix}-projection`,
        },
      },
      include: { transitions: true },
    });
    expect(saved?.outstandingAmount.toString()).toBe("50");
    expect(saved?.shopifyUpdatedAt?.toISOString()).toBe(
      "2026-07-31T12:00:00.000Z",
    );
    expect(saved?.transitions).toHaveLength(1);
  });

  it("creates exactly one delivery reservation under concurrent planners", async () => {
    const fixture = await createReminderFixture("reservation-race");
    const { planDueReminderDeliveries } = await reminderService();
    const planned = await Promise.all(
      Array.from({ length: 8 }, () =>
        planDueReminderDeliveries(fixture.shop.id),
      ),
    );

    expect(planned.flat()).toHaveLength(1);
    await expect(
      prisma.reminderDelivery.count({
        where: { shopId: fixture.shop.id, receivableId: fixture.receivable.id },
      }),
    ).resolves.toBe(1);
  });

  it("cancels at the final send boundary when reminder sends are blocked", async () => {
    const fixture = await createReminderFixture("send-switch");
    const { planDueReminderDeliveries, processReminderDelivery } =
      await reminderService();
    const [deliveryId] = await planDueReminderDeliveries(fixture.shop.id);
    expect(deliveryId).toBeTruthy();
    await prisma.safetyControl.create({
      data: {
        shopId: fixture.shop.id,
        controlKey: "REMINDER_SENDS",
        blocked: true,
        reasonCode: "stage4_test",
      },
    });
    const submit = vi.fn();

    await processReminderDelivery({
      deliveryId,
      correlationId: `send-switch-${runPrefix}`,
      provider: { submit } as unknown as PostmarkAdapter,
    });

    const delivery = await prisma.reminderDelivery.findUnique({
      where: { id: deliveryId },
    });
    expect(submit).not.toHaveBeenCalled();
    expect(delivery?.state).toBe("CANCELED");
    expect(delivery?.errorClass).toBe("reminder_sends_safety_blocked");
  });

  it("rejects provider events while the provider-webhook switch is blocked", async () => {
    const fixture = await createReminderFixture("provider-switch");
    const {
      ingestPostmarkEvent,
      planDueReminderDeliveries,
      ProviderWebhookSafetyBlockedError,
    } = await reminderService();
    const [deliveryId] = await planDueReminderDeliveries(fixture.shop.id);
    await prisma.reminderDelivery.update({
      where: { id: deliveryId },
      data: {
        state: "ACCEPTED",
        providerMessageId: `provider-message-${runPrefix}`,
      },
    });
    await prisma.safetyControl.create({
      data: {
        shopId: fixture.shop.id,
        controlKey: "PROVIDER_WEBHOOKS",
        blocked: true,
        reasonCode: "stage4_test",
      },
    });

    await expect(
      ingestPostmarkEvent({
        ID: `provider-event-${runPrefix}`,
        MessageID: `provider-message-${runPrefix}`,
        RecordType: "Delivery",
      }),
    ).rejects.toBeInstanceOf(ProviderWebhookSafetyBlockedError);
    await expect(
      prisma.emailProviderEvent.count({ where: { shopId: fixture.shop.id } }),
    ).resolves.toBe(0);
  });

  it("replays a customer deletion tombstone against restored protected data", async () => {
    const shop = await createShop("privacy-restore");
    const { company } = await createCompanyReceivable(shop.id, "privacy");
    const customerGid = "gid://shopify/Customer/88001";
    const contact = await prisma.companyContact.create({
      data: {
        shopId: shop.id,
        companyId: company.id,
        shopifyContactGid: `gid://shopify/CompanyContact/${runPrefix}-privacy`,
        shopifyCustomerGid: customerGid,
        encryptedEmail: "opaque-protected-ciphertext",
        emailHmac: `hmac-${runPrefix}-privacy`,
        emailValid: true,
      },
    });
    const accepted = await acceptPrivacyWebhook({
      shopDomain: shop.shopDomain,
      type: "CUSTOMER_REDACT",
      payload: { customer: { id: 88001 }, orders_to_redact: [] },
      webhookId: `privacy-${runPrefix}`,
      correlationId: `privacy-accept-${runPrefix}`,
    });
    expect(accepted).not.toBeNull();
    await processPrivacyRequest(
      accepted!.requestId,
      `privacy-process-${runPrefix}`,
    );

    await prisma.companyContact.update({
      where: { id: contact.id },
      data: {
        shopifyCustomerGid: customerGid,
        encryptedEmail: "restored-protected-ciphertext",
        emailHmac: `restored-hmac-${runPrefix}`,
        emailValid: true,
        status: "ACTIVE",
        redactedAt: null,
      },
    });
    const replayed = await replayDeletionTombstones();
    const restored = await prisma.companyContact.findUnique({
      where: { id: contact.id },
    });

    expect(replayed).toBeGreaterThanOrEqual(1);
    expect(restored?.shopifyCustomerGid).toBeNull();
    expect(restored?.encryptedEmail).toBeNull();
    expect(restored?.emailHmac).toBeNull();
    expect(restored?.status).toBe("REDACTED");
    await expect(countDeletionTombstoneConflicts()).resolves.toBe(0);
  });

  it("purges a policy-bearing shop and reapplies its tombstone after restore", async () => {
    const fixture = await createReminderFixture("shop-restore");
    const accepted = await acceptPrivacyWebhook({
      shopDomain: fixture.shop.shopDomain,
      type: "SHOP_REDACT",
      payload: {},
      webhookId: `shop-redact-${runPrefix}`,
      correlationId: `shop-redact-${runPrefix}`,
    });
    expect(accepted).not.toBeNull();
    await processPrivacyRequest(
      accepted!.requestId,
      `shop-redact-process-${runPrefix}`,
    );
    await expect(
      prisma.shop.findUnique({ where: { id: fixture.shop.id } }),
    ).resolves.toBeNull();

    const restored = await prisma.shop.create({
      data: { shopDomain: fixture.shop.shopDomain, status: "INACTIVE" },
    });
    createdShopIds.add(restored.id);
    await replayDeletionTombstones();
    await expect(
      prisma.shop.findUnique({ where: { id: restored.id } }),
    ).resolves.toBeNull();
    await expect(countDeletionTombstoneConflicts()).resolves.toBe(0);
  });

  it("restarts the queue adapter without losing dead-letter visibility", async () => {
    const first = new PgBossJobAdapter();
    await first.start();
    const beforeRestart = await first.deadLetterCount();
    await first.stop();

    const second = new PgBossJobAdapter();
    await second.start();
    await expect(second.deadLetterCount()).resolves.toBe(beforeRestart);
    await second.stop();
  });

  it("keeps the active receivable filters backed by the intended indexes", async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'receivables'
    `;
    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "receivables_shopId_status_dueAt_idx",
        "receivables_shopId_currency_agingBucket_dueAt_idx",
      ]),
    );

    const plan = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      return transaction.$queryRawUnsafe<Array<{ "QUERY PLAN": string }>>(
        `EXPLAIN SELECT * FROM "receivables" WHERE "shopId" = 'stage4-plan' AND "currency" = 'USD' AND "agingBucket" = 'ONE_TO_THIRTY' ORDER BY "dueAt"`,
      );
    });
    expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
      "receivables_shopId_currency_agingBucket_dueAt_idx",
    );
  });
});
