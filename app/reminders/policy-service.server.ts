import { createHash, randomInt } from "node:crypto";

import { Prisma } from "@prisma/client";

import prisma from "../db.server";
import {
  entitlementDecisionForShop,
  requireEntitlement,
} from "../billing/entitlement-service.server";
import { AuditRepository } from "../operations/audit-repository.server";
import {
  decryptSessionSecret,
  encryptSessionSecret,
} from "../platform/security/encryption.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";
import {
  validateEmailHeader,
  validateReminderTemplate,
} from "./reminder-rules";
import { PostmarkAdapter } from "./postmark-adapter.server";

export class ReminderPolicyInputError extends Error {}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function tokenHash(shopId: string, code: string): string {
  return createHash("sha256").update(`${shopId}:${code}`).digest("hex");
}

function bodyContext(shopId: string, versionId: string, stageKey: string): string {
  return `reminder-stage:${shopId}:${versionId}:${stageKey}:body`;
}

async function activeShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: normalizeShopDomain(shopDomain) },
  });
  if (!shop || shop.status !== "ACTIVE")
    throw new ReminderPolicyInputError("Shop is inactive");
  return shop;
}

export async function requestReplyToVerification(input: {
  shopDomain: string;
  email: string;
  correlationId: string;
  provider?: PostmarkAdapter;
}): Promise<void> {
  const shop = await activeShop(input.shopDomain);
  const email = input.email.trim().toLowerCase();
  if (email.length > 320 || !EMAIL_PATTERN.test(email))
    throw new ReminderPolicyInputError("Enter a valid reply-to email");
  const code = randomInt(100_000, 1_000_000).toString();
  await (input.provider ?? new PostmarkAdapter()).sendVerification(email, code);
  await prisma.replyToVerification.upsert({
    where: { shopId_email: { shopId: shop.id, email } },
    create: {
      shopId: shop.id,
      email,
      tokenHash: tokenHash(shop.id, code),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
    update: {
      tokenHash: tokenHash(shop.id, code),
      state: "PENDING",
      expiresAt: new Date(Date.now() + 30 * 60_000),
      verifiedAt: null,
    },
  });
}

export async function verifyReplyTo(input: {
  shopDomain: string;
  email: string;
  code: string;
}): Promise<void> {
  const shop = await activeShop(input.shopDomain);
  const email = input.email.trim().toLowerCase();
  const updated = await prisma.replyToVerification.updateMany({
    where: {
      shopId: shop.id,
      email,
      state: "PENDING",
      expiresAt: { gt: new Date() },
      tokenHash: tokenHash(shop.id, input.code.trim()),
    },
    data: { state: "VERIFIED", verifiedAt: new Date() },
  });
  if (updated.count !== 1)
    throw new ReminderPolicyInputError("Verification code is invalid or expired");
}

export async function createReminderPolicyDraft(input: {
  shopDomain: string;
  name: string;
  senderDisplayName: string;
  replyTo: string;
  minimumOutstanding: string;
  stages: Array<{
    stageKey: string;
    offsetDays: number;
    subject: string;
    body: string;
    enabled: boolean;
  }>;
  policyId?: string;
  actorId?: string;
  correlationId: string;
}): Promise<string> {
  const shop = await activeShop(input.shopDomain);
  const verification = await prisma.replyToVerification.findUnique({
    where: {
      shopId_email: {
        shopId: shop.id,
        email: input.replyTo.trim().toLowerCase(),
      },
    },
  });
  if (verification?.state !== "VERIFIED")
    throw new ReminderPolicyInputError("Verify the reply-to address first");
  if (!input.name.trim() || input.name.length > 120 || input.stages.length === 0)
    throw new ReminderPolicyInputError("Policy name and at least one stage are required");
  const senderDisplayName = validateEmailHeader(input.senderDisplayName, 120);
  const minimumOutstanding = new Prisma.Decimal(input.minimumOutstanding || "0");
  if (minimumOutstanding.isNegative())
    throw new ReminderPolicyInputError("Minimum outstanding cannot be negative");
  for (const stage of input.stages) {
    validateEmailHeader(stage.subject, 200);
    validateReminderTemplate(stage.subject);
    validateReminderTemplate(stage.body);
    if (!/^[a-z0-9_-]{1,40}$/.test(stage.stageKey) || Math.abs(stage.offsetDays) > 365)
      throw new ReminderPolicyInputError("Reminder stage is invalid");
  }

  return prisma.$transaction(async (transaction) => {
    const existingPolicy = input.policyId
      ? await transaction.reminderPolicy.findFirst({
          where: { id: input.policyId, shopId: shop.id, state: { not: "ARCHIVED" } },
          include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        })
      : null;
    if (input.policyId && !existingPolicy)
      throw new ReminderPolicyInputError("Policy not found");
    const policy =
      existingPolicy ??
      (await transaction.reminderPolicy.create({
        data: {
          shopId: shop.id,
          name: input.name.trim(),
          timezone: shop.timezone,
        },
        include: { versions: true },
      }));
    const versionNumber = (policy.versions[0]?.versionNumber ?? 0) + 1;
    const version = await transaction.reminderPolicyVersion.create({
      data: {
        shopId: shop.id,
        reminderPolicyId: policy.id,
        versionNumber,
        senderDisplayName,
        replyToVerificationId: verification.id,
        minimumOutstanding,
      },
    });
    await transaction.reminderPolicyStage.createMany({
      data: input.stages.map((stage, index) => ({
        shopId: shop.id,
        reminderPolicyVersionId: version.id,
        stageKey: stage.stageKey,
        offsetDays: stage.offsetDays,
        sortOrder: index,
        subjectTemplate: stage.subject,
        encryptedBodyTemplate: encryptSessionSecret(
          stage.body,
          bodyContext(shop.id, version.id, stage.stageKey),
        ),
        enabled: stage.enabled,
      })),
    });
    await new AuditRepository(transaction, shop.id).append({
      actorType: "MERCHANT",
      actorId: input.actorId,
      action: "reminder.policy_draft_created",
      targetType: "reminder_policy",
      targetId: policy.id,
      safeAfter: { versionNumber, stageCount: input.stages.length },
      reason: "merchant_configuration",
      correlationId: input.correlationId,
    });
    return policy.id;
  });
}

export async function previewReminderPolicy(
  shopDomain: string,
  policyId: string,
): Promise<void> {
  const shop = await activeShop(shopDomain);
  const policy = await prisma.reminderPolicy.findFirst({
    where: { id: policyId, shopId: shop.id, state: "DRAFT" },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!policy?.versions[0]) throw new ReminderPolicyInputError("Draft not found");
  await prisma.reminderPolicyVersion.update({
    where: { id: policy.versions[0].id },
    data: { previewedAt: new Date() },
  });
}

export async function approveAndActivatePolicy(input: {
  shopDomain: string;
  policyId: string;
  actorId?: string;
  correlationId: string;
}): Promise<void> {
  const shop = await activeShop(input.shopDomain);
  await requireEntitlement(shop.id, "ACTIVATE_REMINDER_AUTOMATION");
  await prisma.$transaction(async (transaction) => {
    const policy = await transaction.reminderPolicy.findFirst({
      where: { id: input.policyId, shopId: shop.id, state: { not: "ARCHIVED" } },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: { replyToVerification: true },
        },
      },
    });
    const version = policy?.versions[0];
    if (!policy || !version?.previewedAt)
      throw new ReminderPolicyInputError("Preview the policy before approval");
    if (version.replyToVerification.state !== "VERIFIED")
      throw new ReminderPolicyInputError("Reply-to address is not verified");
    const now = new Date();
    await transaction.reminderPolicyVersion.update({
      where: { id: version.id },
      data: { approvedAt: now },
    });
    await transaction.reminderPolicy.updateMany({
      where: { shopId: shop.id, state: "ACTIVE", id: { not: policy.id } },
      data: { state: "PAUSED" },
    });
    await transaction.reminderPolicy.update({
      where: { id: policy.id },
      data: {
        state: "ACTIVE",
        activeVersionId: version.id,
        approvedAt: now,
        approvedBy: input.actorId,
      },
    });
    await new AuditRepository(transaction, shop.id).append({
      actorType: "MERCHANT",
      actorId: input.actorId,
      action: "reminder.policy_activated",
      targetType: "reminder_policy",
      targetId: policy.id,
      safeAfter: { versionNumber: version.versionNumber },
      reason: "explicit_preview_and_approval",
      correlationId: input.correlationId,
    });
  });
}

export async function setGlobalReminderPause(input: {
  shopDomain: string;
  paused: boolean;
  correlationId: string;
}): Promise<void> {
  const shop = await activeShop(input.shopDomain);
  await prisma.$transaction(async (transaction) => {
    await transaction.shop.update({
      where: { id: shop.id },
      data: { globalRemindersPaused: input.paused },
    });
    await new AuditRepository(transaction, shop.id).append({
      actorType: "MERCHANT",
      action: input.paused ? "reminder.global_paused" : "reminder.global_resumed",
      targetType: "shop",
      targetId: shop.id,
      safeAfter: { paused: input.paused },
      reason: "merchant_safety_control",
      correlationId: input.correlationId,
    });
  });
}

export async function loadReminderSettings(shopDomain: string) {
  const shop = await activeShop(shopDomain);
  const [policies, verifications, deliveries, entitlementDecision] =
    await Promise.all([
    prisma.reminderPolicy.findMany({
      where: { shopId: shop.id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: { stages: { orderBy: { sortOrder: "asc" } }, replyToVerification: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.replyToVerification.findMany({
      where: { shopId: shop.id },
      select: { email: true, state: true, expiresAt: true },
    }),
    prisma.reminderDelivery.findMany({
      where: { shopId: shop.id },
      select: { id: true, state: true, scheduledAt: true, sentAt: true, errorClass: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    entitlementDecisionForShop(
      shop.id,
      "ACTIVATE_REMINDER_AUTOMATION",
    ),
  ]);
  return {
    paused: shop.globalRemindersPaused,
    syncStatus: shop.syncStatus,
    policies: policies.map((policy) => ({
      id: policy.id,
      name: policy.name,
      state: policy.state,
      approvedAt: policy.approvedAt,
      version: policy.versions[0]
        ? {
            id: policy.versions[0].id,
            versionNumber: policy.versions[0].versionNumber,
            senderDisplayName: policy.versions[0].senderDisplayName,
            replyTo: policy.versions[0].replyToVerification.email,
            replyToState: policy.versions[0].replyToVerification.state,
            minimumOutstanding:
              policy.versions[0].minimumOutstanding.toString(),
            previewedAt: policy.versions[0].previewedAt,
            stages: policy.versions[0].stages.map((stage) => ({
              id: stage.id,
              stageKey: stage.stageKey,
              offsetDays: stage.offsetDays,
              subject: stage.subjectTemplate,
              body: decryptSessionSecret(
                stage.encryptedBodyTemplate,
                bodyContext(shop.id, policy.versions[0]!.id, stage.stageKey),
              ),
              enabled: stage.enabled,
            })),
          }
        : null,
    })),
    verifications,
    deliveries,
    entitlementDecision,
  };
}
