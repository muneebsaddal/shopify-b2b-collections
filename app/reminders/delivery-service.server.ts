import { createHash, timingSafeEqual } from "node:crypto";

import { Prisma, type ReminderDeliveryState } from "@prisma/client";

import prisma from "../db.server";
import { AuditRepository } from "../operations/audit-repository.server";
import { isOperationAllowed } from "../operations/safety-controls.server";
import {
  decryptSessionSecret,
  encryptSessionSecret,
} from "../platform/security/encryption.server";
import { RECEIVABLE_ORDER_CONTRACT_QUERY } from "../platform/shopify/contracts/admin-contracts";
import { unauthenticated } from "../shopify.server";
import {
  eligibilityEvidenceHash,
  isStageDue,
  resolvedStageInstant,
  renderReminderTemplate,
  validateEmailHeader,
} from "./reminder-rules";
import { PostmarkAdapter } from "./postmark-adapter.server";

export class ProviderWebhookSafetyBlockedError extends Error {}

function contactEmailContext(shopId: string, contactGid: string): string {
  return `company-contact:${shopId}:${contactGid}:email`;
}

function stageBodyContext(shopId: string, versionId: string, stageKey: string) {
  return `reminder-stage:${shopId}:${versionId}:${stageKey}:body`;
}

function deliveryContext(shopId: string, deliveryId: string, field: string) {
  return `reminder-delivery:${shopId}:${deliveryId}:${field}`;
}

type LiveOrder = {
  id?: string;
  cancelledAt?: string | null;
  closedAt?: string | null;
  totalOutstandingSet?: {
    shopMoney?: { amount?: string; currencyCode?: string };
  };
  paymentTerms?: {
    paymentSchedules?: {
      pageInfo?: { hasNextPage?: boolean };
      nodes?: Array<{ dueAt?: string | null; completedAt?: string | null }>;
    };
  } | null;
};

async function liveShopifyOrder(
  shopDomain: string,
  orderGid: string,
): Promise<LiveOrder> {
  const { admin } = await unauthenticated.admin(shopDomain);
  const response = await admin.graphql(RECEIVABLE_ORDER_CONTRACT_QUERY, {
    variables: { id: orderGid },
  });
  const envelope = (await response.json()) as {
    data?: { order?: LiveOrder | null };
    errors?: unknown[];
  };
  if (envelope.errors?.length || !envelope.data?.order)
    throw new Error("shopify_live_validation_ambiguous");
  return envelope.data.order;
}

function liveOrderEligible(order: LiveOrder, expectedCurrency: string): {
  amount: string;
  currency: string;
  dueAt: string;
} {
  const money = order.totalOutstandingSet?.shopMoney;
  const schedules = order.paymentTerms?.paymentSchedules;
  const dueAt = schedules?.nodes?.find((item) => item.dueAt)?.dueAt;
  if (
    order.cancelledAt ||
    order.closedAt ||
    !money?.amount ||
    !money.currencyCode ||
    money.currencyCode !== expectedCurrency ||
    Number(money.amount) <= 0 ||
    !dueAt ||
    schedules?.pageInfo?.hasNextPage
  ) {
    throw new Error("shopify_live_order_ineligible");
  }
  return { amount: money.amount, currency: money.currencyCode, dueAt };
}

export async function planDueReminderDeliveries(
  shopId: string,
  now = new Date(),
): Promise<string[]> {
  const policies = await prisma.reminderPolicy.findMany({
    where: { shopId, state: "ACTIVE", activeVersionId: { not: null } },
    include: {
      activeVersion: {
        include: {
          stages: { where: { enabled: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  const created: string[] = [];
  for (const policy of policies) {
    const version = policy.activeVersion;
    if (!version) continue;
    const receivables = await prisma.receivable.findMany({
      where: {
        shopId,
        status: "OPEN",
        dueAt: { not: null },
        outstandingAmount: { gte: version.minimumOutstanding },
        companyId: { not: null },
      },
      include: {
        company: {
          include: {
            contacts: {
              where: { status: "ACTIVE", emailValid: true, encryptedEmail: { not: null } },
              orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
              take: 1,
            },
            reminderSuppressions: {
              where: {
                releasedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
              take: 1,
            },
          },
        },
        collectionNotes: {
          where: { type: "DISPUTE" },
          select: { id: true },
          take: 1,
        },
      },
    });
    for (const receivable of receivables) {
      const contact = receivable.company?.contacts[0];
      if (
        !receivable.dueAt ||
        !contact?.emailHmac ||
        receivable.company?.reminderSuppressions.length ||
        receivable.collectionNotes.length
      ) {
        continue;
      }
      const recipientSuppressed = await prisma.recipientSuppression.findFirst({
        where: {
          shopId,
          emailHmac: contact.emailHmac,
          releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      });
      if (recipientSuppressed) continue;

      for (const stage of version.stages) {
        if (!isStageDue(receivable.dueAt, stage.offsetDays, now, policy.timezone))
          continue;
        const scheduledAt = resolvedStageInstant(
          receivable.dueAt,
          stage.offsetDays,
          policy.timezone,
        );
        const reservationKey = createHash("sha256")
          .update(`${shopId}:${receivable.id}:${version.id}:${stage.id}`)
          .digest("hex");
        let delivery: { id: string } | null;
        try {
          delivery = await prisma.reminderDelivery.create({
            data: {
              shopId,
              receivableId: receivable.id,
              companyContactId: contact.id,
              reminderPolicyVersionId: version.id,
              reminderPolicyStageId: stage.id,
              reservationKey,
              scheduledAt,
            },
            select: { id: true },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
            delivery = null;
          else throw error;
        }
        if (delivery) created.push(delivery.id);
      }
    }
  }
  return created;
}

export async function processReminderDelivery(input: {
  deliveryId: string;
  correlationId: string;
  provider?: PostmarkAdapter;
}): Promise<void> {
  const claimed = await prisma.reminderDelivery.updateMany({
    where: {
      id: input.deliveryId,
      state: { in: ["RESERVED", "FAILED"] },
      attemptCount: { lt: 3 },
    },
    data: { state: "VALIDATING", attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return;

  const delivery = await prisma.reminderDelivery.findUnique({
    where: { id: input.deliveryId },
    include: {
      shop: true,
      receivable: { include: { company: true, collectionNotes: true } },
      companyContact: true,
      policyVersion: { include: { replyToVerification: true, policy: true } },
      policyStage: true,
    },
  });
  if (!delivery) return;
  if (!(await isOperationAllowed(delivery.shopId, "REMINDER_SENDS"))) {
    await prisma.reminderDelivery.updateMany({
      where: { id: delivery.id, state: "VALIDATING" },
      data: {
        state: "CANCELED",
        errorClass: "reminder_sends_safety_blocked",
        finalAt: new Date(),
      },
    });
    return;
  }

  try {
    if (
      delivery.shop.status !== "ACTIVE" ||
      !delivery.shop.scopesComplete ||
      delivery.shop.globalRemindersPaused ||
      delivery.shop.syncStatus !== "FRESH" ||
      delivery.policyVersion.policy.state !== "ACTIVE" ||
      delivery.policyVersion.replyToVerification.state !== "VERIFIED" ||
      delivery.receivable.status !== "OPEN" ||
      delivery.receivable.outstandingAmount.lte(0) ||
      !delivery.receivable.companyId ||
      delivery.receivable.collectionNotes.some((note) => note.type === "DISPUTE") ||
      !delivery.companyContact.encryptedEmail ||
      !delivery.companyContact.emailHmac ||
      !delivery.companyContact.emailValid
    ) {
      throw new Error("local_eligibility_failed");
    }
    const [companySuppression, recipientSuppression, liveOrder] = await Promise.all([
      prisma.companyReminderSuppression.findFirst({
        where: {
          shopId: delivery.shopId,
          companyId: delivery.receivable.companyId,
          releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      prisma.recipientSuppression.findFirst({
        where: {
          shopId: delivery.shopId,
          emailHmac: delivery.companyContact.emailHmac,
          releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      liveShopifyOrder(delivery.shop.shopDomain, delivery.receivable.shopifyOrderGid),
    ]);
    if (companySuppression || recipientSuppression)
      throw new Error("suppression_active");
    const live = liveOrderEligible(liveOrder, delivery.receivable.currency);
    const recipient = decryptSessionSecret(
      delivery.companyContact.encryptedEmail,
      contactEmailContext(delivery.shopId, delivery.companyContact.shopifyContactGid),
    );
    const facts = {
      companyName: delivery.receivable.company?.displayName ?? "Customer",
      orderName: delivery.receivable.orderName,
      outstandingAmount: live.amount,
      currency: live.currency,
      dueDate: new Date(live.dueAt).toISOString().slice(0, 10),
    };
    const subject = validateEmailHeader(
      renderReminderTemplate(delivery.policyStage.subjectTemplate, facts),
      200,
    );
    const body = renderReminderTemplate(
      decryptSessionSecret(
        delivery.policyStage.encryptedBodyTemplate,
        stageBodyContext(
          delivery.shopId,
          delivery.policyVersion.id,
          delivery.policyStage.stageKey,
        ),
      ),
      facts,
    );
    const evidenceHash = eligibilityEvidenceHash({
      shopId: delivery.shopId,
      receivableId: delivery.receivableId,
      outstandingAmount: live.amount,
      currency: live.currency,
      status: "OPEN",
      dueAt: live.dueAt,
      contactId: delivery.companyContactId,
      stageId: delivery.reminderPolicyStageId,
    });
    const ready = await prisma.reminderDelivery.updateMany({
      where: { id: delivery.id, state: "VALIDATING" },
      data: {
        state: "SENDING",
        eligibilityEvidenceHash: evidenceHash,
        encryptedRecipient: encryptSessionSecret(
          recipient,
          deliveryContext(delivery.shopId, delivery.id, "recipient"),
        ),
        encryptedSubject: encryptSessionSecret(
          subject,
          deliveryContext(delivery.shopId, delivery.id, "subject"),
        ),
        encryptedBody: encryptSessionSecret(
          body,
          deliveryContext(delivery.shopId, delivery.id, "body"),
        ),
        errorClass: null,
      },
    });
    if (ready.count !== 1) return;

    const submission = await (input.provider ?? new PostmarkAdapter()).submit({
      to: recipient,
      replyTo: delivery.policyVersion.replyToVerification.email,
      subject,
      body,
      metadata: { deliveryId: delivery.id, shopId: delivery.shopId },
    });
    if (submission.kind === "unknown") {
      await prisma.reminderDelivery.update({
        where: { id: delivery.id },
        data: { state: "UNKNOWN", errorClass: submission.code, finalAt: new Date() },
      });
      return;
    }
    if (submission.kind === "definite-failure") {
      await prisma.reminderDelivery.update({
        where: { id: delivery.id },
        data: {
          state: delivery.attemptCount < 3 ? "FAILED" : "CANCELED",
          errorClass: submission.code,
          finalAt: delivery.attemptCount < 3 ? null : new Date(),
        },
      });
      throw new Error("provider_definite_failure");
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.reminderDelivery.update({
        where: { id: delivery.id },
        data: {
          state: "ACCEPTED",
          providerMessageId: submission.messageId,
          sentAt: new Date(),
          errorClass: null,
        },
      });
      await transaction.collectionAction.create({
        data: {
          shopId: delivery.shopId,
          companyId: delivery.receivable.companyId,
          receivableId: delivery.receivableId,
          type: "REMINDER_SENT",
          safeSummary: `Reminder ${delivery.policyStage.stageKey} accepted by provider`,
        },
      });
      await new AuditRepository(transaction, delivery.shopId).append({
        actorType: "WORKER",
        action: "reminder.provider_accepted",
        targetType: "reminder_delivery",
        targetId: delivery.id,
        safeAfter: { state: "ACCEPTED", stageKey: delivery.policyStage.stageKey },
        reason: "live_shopify_eligibility_confirmed",
        correlationId: input.correlationId,
      });
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "eligibility_ambiguous";
    if (code === "provider_definite_failure") throw error;
    const current = await prisma.reminderDelivery.findUnique({
      where: { id: input.deliveryId },
      select: { state: true },
    });
    await prisma.reminderDelivery.updateMany({
      where: { id: input.deliveryId, state: { in: ["VALIDATING", "SENDING"] } },
      data:
        current?.state === "SENDING"
          ? { state: "UNKNOWN", errorClass: "provider_submission_ambiguous", finalAt: new Date() }
          : { state: "CANCELED", errorClass: code, finalAt: new Date() },
    });
  }
}

const EVENT_STATE: Record<string, ReminderDeliveryState> = {
  Delivery: "DELIVERED",
  Transient: "DEFERRED",
  HardBounce: "BOUNCED",
  SpamComplaint: "COMPLAINED",
  SubscriptionChange: "SUPPRESSED",
};

const STATE_RANK: Partial<Record<ReminderDeliveryState, number>> = {
  ACCEPTED: 1,
  DEFERRED: 2,
  DELIVERED: 3,
  BOUNCED: 4,
  SUPPRESSED: 4,
  COMPLAINED: 5,
};

export function verifyPostmarkWebhook(request: Request): void {
  const expected = process.env.POSTMARK_WEBHOOK_TOKEN;
  const supplied = request.headers.get("x-postmark-webhook-token");
  if (!expected || !supplied) throw new Error("provider_webhook_unauthorized");
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new Error("provider_webhook_unauthorized");
}

export async function ingestPostmarkEvent(payload: unknown): Promise<void> {
  const record = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
  const messageId = typeof record.MessageID === "string" ? record.MessageID : "";
  const eventId =
    typeof record.ID === "number" || typeof record.ID === "string"
      ? String(record.ID)
      : createHash("sha256").update(JSON.stringify(record)).digest("hex");
  const recordType = typeof record.RecordType === "string" ? record.RecordType : "";
  const bounceType = typeof record.Type === "string" ? record.Type : "";
  const eventKey = recordType === "Bounce" ? bounceType : recordType;
  const nextState =
    eventKey === "SubscriptionChange" && record.SuppressSending !== true
      ? undefined
      : EVENT_STATE[eventKey];
  if (!messageId || !nextState) return;
  const delivery = await prisma.reminderDelivery.findUnique({
    where: { providerMessageId: messageId },
    include: { companyContact: true },
  });
  if (!delivery) return;
  if (!(await isOperationAllowed(delivery.shopId, "PROVIDER_WEBHOOKS"))) {
    throw new ProviderWebhookSafetyBlockedError();
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "reminder_deliveries"
      WHERE "id" = ${delivery.id}
      FOR UPDATE
    `;
    const duplicate = await transaction.emailProviderEvent.findUnique({
      where: {
        shopId_providerEventId: { shopId: delivery.shopId, providerEventId: eventId },
      },
    });
    if (duplicate) return;
    const currentDelivery = await transaction.reminderDelivery.findUnique({
      where: { id: delivery.id },
      select: { state: true },
    });
    if (!currentDelivery) return;
    await transaction.emailProviderEvent.create({
      data: {
        shopId: delivery.shopId,
        reminderDeliveryId: delivery.id,
        providerEventId: eventId,
        eventType: eventKey,
        providerAt:
          typeof record.ReceivedAt === "string" ? new Date(record.ReceivedAt) : undefined,
        diagnosticCode:
          typeof record.TypeCode === "number" ? String(record.TypeCode) : undefined,
        processedAt: new Date(),
      },
    });
    if (
      (STATE_RANK[nextState] ?? 0) >=
      (STATE_RANK[currentDelivery.state] ?? 0)
    ) {
      await transaction.reminderDelivery.update({
        where: { id: delivery.id },
        data: {
          state: nextState,
          finalAt: ["DELIVERED", "BOUNCED", "COMPLAINED", "SUPPRESSED"].includes(nextState)
            ? new Date()
            : undefined,
        },
      });
    }
    if (
      ["BOUNCED", "COMPLAINED", "SUPPRESSED"].includes(nextState) &&
      delivery.companyContact.emailHmac
    ) {
      await transaction.recipientSuppression.create({
        data: {
          shopId: delivery.shopId,
          emailHmac: delivery.companyContact.emailHmac,
          companyContactId: delivery.companyContactId,
          companyId: delivery.companyContact.companyId,
          source:
            nextState === "BOUNCED"
              ? "BOUNCE"
              : nextState === "COMPLAINED"
                ? "COMPLAINT"
                : "PROVIDER",
          reasonCode: eventKey.toLowerCase(),
        },
      });
    }
  });
}
