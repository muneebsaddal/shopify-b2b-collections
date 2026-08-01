import prisma from "../db.server";
import { createCorrelationId } from "../operations/correlation.server";
import { processPrivacyRequest } from "./privacy-service.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runRetentionSweep(now = new Date()): Promise<void> {
  const dueRequests = await prisma.privacyRequest.findMany({
    where: {
      state: { in: ["QUEUED", "FAILED"] },
      attempts: { lt: 5 },
      OR: [
        { type: { in: ["CUSTOMER_DATA", "CUSTOMER_REDACT", "SHOP_REDACT"] } },
        { type: "UNINSTALL_CLEANUP", dueAt: { lte: now } },
      ],
    },
    select: { id: true },
    take: 100,
    orderBy: { dueAt: "asc" },
  });
  for (const request of dueRequests) {
    await processPrivacyRequest(request.id, createCorrelationId());
  }

  const webhookCutoff = new Date(now.getTime() - 7 * DAY_MS);
  const metadataCutoff = new Date(now.getTime() - 365 * DAY_MS);
  await Promise.all([
    prisma.webhookReceipt.deleteMany({
      where: { state: "PROCESSED", processedAt: { lt: webhookCutoff } },
    }),
    prisma.reminderDelivery.updateMany({
      where: {
        finalAt: { lt: metadataCutoff },
        OR: [
          { encryptedRecipient: { not: null } },
          { encryptedSubject: { not: null } },
          { encryptedBody: { not: null } },
        ],
      },
      data: {
        encryptedRecipient: null,
        encryptedSubject: null,
        encryptedBody: null,
      },
    }),
    prisma.emailProviderEvent.deleteMany({
      where: { receivedAt: { lt: metadataCutoff } },
    }),
    prisma.protectedDataAccessLog.deleteMany({
      where: { createdAt: { lt: metadataCutoff } },
    }),
  ]);
}
