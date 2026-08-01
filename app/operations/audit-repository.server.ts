import type {
  AuditActorType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type AppendAuditEventInput = {
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  safeBefore?: Prisma.InputJsonValue;
  safeAfter?: Prisma.InputJsonValue;
  reason?: string;
  correlationId: string;
};

export class AuditRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly shopId: string,
  ) {}

  append(input: AppendAuditEventInput) {
    return this.database.auditEvent.create({
      data: {
        shopId: this.shopId,
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        safeBefore: input.safeBefore,
        safeAfter: input.safeAfter,
        reason: input.reason,
        correlationId: input.correlationId,
        applicationVersion: process.env.RELEASE_VERSION,
      },
    });
  }
}
