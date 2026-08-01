import type {
  AuditActorType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type RecordProtectedDataAccessInput = {
  actorType: AuditActorType;
  actorId?: string;
  purposeCode: string;
  resourceCategory: string;
  action: string;
  correlationId: string;
  approvalReference?: string;
  incidentReference?: string;
  outcome: string;
};

export class ProtectedDataAccessRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly shopId: string,
  ) {}

  record(input: RecordProtectedDataAccessInput) {
    return this.database.protectedDataAccessLog.create({
      data: {
        shopId: this.shopId,
        ...input,
      },
    });
  }
}
