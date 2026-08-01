import type { Prisma, PrismaClient, Session } from "@prisma/client";

import { decryptSessionSecret, encryptSessionSecret } from "../security/encryption.server";

type DatabaseClient = PrismaClient;
type TransactionClient = Prisma.TransactionClient;

export class TokenRotationConflictError extends Error {
  constructor() {
    super("Shopify session token was rotated by another worker");
  }
}

export class RevokedSessionError extends Error {
  constructor() {
    super("Shopify session is revoked");
  }
}

export type RefreshedTokenSet = {
  accessToken: string;
  accessExpiresAt: Date | null;
  refreshToken?: string | null;
  refreshExpiresAt?: Date | null;
};

type RotationInput = {
  sessionId: string;
  expectedTokenVersion: number;
  refresh: (current: {
    accessToken: string;
    refreshToken: string | null;
    accessExpiresAt: Date | null;
    refreshExpiresAt: Date | null;
  }) => Promise<RefreshedTokenSet>;
};

function secretContext(shopDomain: string, field: "access-token" | "refresh-token") {
  return `shopify-session:${shopDomain}:${field}`;
}

async function lockSession(transaction: TransactionClient, sessionId: string): Promise<Session | null> {
  // A row lock is database-distributed across every web and worker process.
  // The following ORM read happens after the lock on the same transaction.
  await transaction.$queryRaw`SELECT "id" FROM "shopify_sessions" WHERE "id" = ${sessionId} FOR UPDATE`;
  return transaction.session.findUnique({ where: { id: sessionId } });
}

/**
 * Rotates a Shopify offline token lineage under a PostgreSQL row lock and an
 * explicit token-version compare-and-swap. The refresh callback is deliberately
 * injected so this domain service never owns Shopify API credentials or logs.
 */
export class OfflineTokenRotationService {
  constructor(private readonly database: DatabaseClient) {}

  async rotate(input: RotationInput): Promise<number> {
    return this.database.$transaction(async (transaction) => {
      const session = await lockSession(transaction, input.sessionId);
      if (!session || session.revokedAt) throw new RevokedSessionError();
      if (session.tokenVersion !== input.expectedTokenVersion) {
        throw new TokenRotationConflictError();
      }

      const refreshed = await input.refresh({
        accessToken: decryptSessionSecret(session.accessToken, secretContext(session.shop, "access-token")),
        refreshToken: session.refreshToken
          ? decryptSessionSecret(session.refreshToken, secretContext(session.shop, "refresh-token"))
          : null,
        accessExpiresAt: session.expires,
        refreshExpiresAt: session.refreshTokenExpires,
      });

      const result = await transaction.session.updateMany({
        where: { id: session.id, tokenVersion: input.expectedTokenVersion, revokedAt: null },
        data: {
          accessToken: encryptSessionSecret(refreshed.accessToken, secretContext(session.shop, "access-token")),
          expires: refreshed.accessExpiresAt,
          refreshToken:
            refreshed.refreshToken === undefined
              ? session.refreshToken
              : refreshed.refreshToken
                ? encryptSessionSecret(refreshed.refreshToken, secretContext(session.shop, "refresh-token"))
                : null,
          refreshTokenExpires:
            refreshed.refreshExpiresAt === undefined
              ? session.refreshTokenExpires
              : refreshed.refreshExpiresAt,
          rotatedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new TokenRotationConflictError();
      return input.expectedTokenVersion + 1;
    }, { isolationLevel: "Serializable" });
  }
}
