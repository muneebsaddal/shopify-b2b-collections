import type { AuditActorType, SafetyControlKey } from "@prisma/client";

import prisma from "../db.server";
import { AuditRepository } from "./audit-repository.server";

export class SafetyControlConfirmationError extends Error {}

export async function isOperationAllowed(
  shopId: string,
  controlKey: SafetyControlKey,
): Promise<boolean> {
  const blocked = await prisma.safetyControl.findFirst({
    where: {
      controlKey,
      blocked: true,
      OR: [{ shopId: null }, { shopId }],
    },
    select: { id: true },
  });
  return !blocked;
}

export async function setSafetyControl(input: {
  shopId?: string;
  controlKey: SafetyControlKey;
  blocked: boolean;
  reasonCode: string;
  actorType: Extract<AuditActorType, "MERCHANT" | "OPERATOR">;
  actorId?: string;
  confirmation: string;
  correlationId: string;
}): Promise<void> {
  if (input.confirmation !== "CONFIRM") {
    throw new SafetyControlConfirmationError(
      "Safety-control changes require explicit confirmation",
    );
  }
  const reasonCode = input.reasonCode.trim().slice(0, 80);
  if (!reasonCode) throw new Error("A safe reason code is required");

  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.safetyControl.findFirst({
      where: {
        shopId: input.shopId ?? null,
        controlKey: input.controlKey,
      },
    });
    if (existing) {
      await transaction.safetyControl.update({
        where: { id: existing.id },
        data: {
          blocked: input.blocked,
          reasonCode,
          actorId: input.actorId,
          version: { increment: 1 },
        },
      });
    } else {
      await transaction.safetyControl.create({
        data: {
          shopId: input.shopId,
          controlKey: input.controlKey,
          blocked: input.blocked,
          reasonCode,
          actorId: input.actorId,
        },
      });
    }

    const auditShopIds = input.shopId
      ? [input.shopId]
      : (
          await transaction.shop.findMany({
            where: { status: "ACTIVE" },
            select: { id: true },
          })
        ).map((shop) => shop.id);
    await Promise.all(
      auditShopIds.map((shopId) =>
        new AuditRepository(transaction, shopId).append({
          actorType: input.actorType,
          actorId: input.actorId,
          action: "operations.safety_control_changed",
          targetType: input.shopId
            ? "shop_safety_control"
            : "global_safety_control",
          targetId: input.controlKey,
          safeBefore: existing
            ? { blocked: existing.blocked, version: existing.version }
            : undefined,
          safeAfter: {
            blocked: input.blocked,
            controlKey: input.controlKey,
          },
          reason: reasonCode,
          correlationId: input.correlationId,
        }),
      ),
    );
  });
}
