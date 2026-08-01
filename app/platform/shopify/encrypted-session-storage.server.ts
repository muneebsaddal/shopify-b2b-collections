import type { Prisma, PrismaClient, Session as SessionRow } from "@prisma/client";
import { Session } from "@shopify/shopify-api";

import {
  decryptSessionSecret,
  encryptSessionSecret,
} from "../security/encryption.server";
import { normalizeShopDomain } from "../../tenancy/shop-domain";
import {
  fingerprintScopes,
  hasRequiredScopes,
  normalizeScopes,
} from "../../tenancy/scope-policy";

type DatabaseClient = PrismaClient;

function secretContext(
  shopDomain: string,
  field: "access-token" | "refresh-token",
): string {
  return `shopify-session:${shopDomain}:${field}`;
}

function rowToSession(row: SessionRow): Session {
  const sessionParams: [string, string | number | boolean][] = [
    ["id", row.id],
    ["shop", row.shop],
    ["state", row.state],
    ["isOnline", row.isOnline],
  ];

  if (row.userId !== null) sessionParams.push(["userId", String(row.userId)]);
  if (row.accountOwner) sessionParams.push(["accountOwner", true]);
  if (row.collaborator) sessionParams.push(["collaborator", true]);
  if (row.emailVerified) sessionParams.push(["emailVerified", true]);
  if (row.expires) sessionParams.push(["expires", row.expires.getTime()]);
  if (row.scope) sessionParams.push(["scope", row.scope]);
  if (row.accessToken) {
    sessionParams.push([
      "accessToken",
      decryptSessionSecret(
        row.accessToken,
        secretContext(row.shop, "access-token"),
      ),
    ]);
  }
  if (row.refreshToken) {
    sessionParams.push([
      "refreshToken",
      decryptSessionSecret(
        row.refreshToken,
        secretContext(row.shop, "refresh-token"),
      ),
    ]);
  }
  if (row.refreshTokenExpires) {
    sessionParams.push([
      "refreshTokenExpires",
      row.refreshTokenExpires.getTime(),
    ]);
  }

  return Session.fromPropertyArray(sessionParams, true);
}

export class EncryptedPrismaSessionStorage {
  constructor(private readonly database: DatabaseClient) {}

  async storeSession(session: Session): Promise<boolean> {
    const shopDomain = normalizeShopDomain(session.shop);
    const scopes = normalizeScopes(session.scope);
    const sessionObject = session.toObject();

    await this.database.$transaction(
      async (transaction) => {
        const shop = await transaction.shop.upsert({
          where: { shopDomain },
          create: {
            shopDomain,
            status: "INACTIVE",
            scopesComplete: hasRequiredScopes(scopes),
          },
          update: {
            scopesComplete: hasRequiredScopes(scopes),
          },
        });

        const existing = await transaction.session.findUnique({
          where: { id: session.id },
          select: { shopId: true },
        });
        if (existing && existing.shopId !== shop.id) {
          throw new Error("Session tenant mismatch");
        }

        const data = {
          shopId: shop.id,
          shop: shopDomain,
          state: session.state,
          isOnline: session.isOnline,
          scope: scopes.length > 0 ? scopes.join(",") : null,
          grantedScopeFingerprint: fingerprintScopes(scopes),
          expires: session.expires ?? null,
          accessToken: encryptSessionSecret(
            session.accessToken ?? "",
            secretContext(shopDomain, "access-token"),
          ),
          refreshToken: session.refreshToken
            ? encryptSessionSecret(
                session.refreshToken,
                secretContext(shopDomain, "refresh-token"),
              )
            : null,
          refreshTokenExpires: session.refreshTokenExpires ?? null,
          rotatedAt: new Date(),
          revokedAt: null,
          userId:
            sessionObject.onlineAccessInfo?.associated_user.id != null
              ? BigInt(sessionObject.onlineAccessInfo.associated_user.id)
              : null,
          accountOwner:
            sessionObject.onlineAccessInfo?.associated_user.account_owner ??
            false,
          collaborator:
            sessionObject.onlineAccessInfo?.associated_user.collaborator ??
            false,
          emailVerified:
            sessionObject.onlineAccessInfo?.associated_user.email_verified ??
            false,
        } satisfies Omit<
          Prisma.SessionUncheckedCreateInput,
          "id" | "tokenVersion"
        >;

        if (existing) {
          await transaction.session.update({
            where: {
              shopId_id: {
                shopId: shop.id,
                id: session.id,
              },
            },
            data: {
              ...data,
              tokenVersion: { increment: 1 },
            },
          });
        } else {
          await transaction.session.create({
            data: {
              id: session.id,
              ...data,
            },
          });
        }
      },
      { isolationLevel: "Serializable" },
    );

    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const row = await this.database.session.findUnique({ where: { id } });
    if (!row || row.revokedAt) return undefined;
    return rowToSession(row);
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.database.session.deleteMany({ where: { id } });
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await this.database.session.deleteMany({ where: { id: { in: ids } } });
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const shopDomain = normalizeShopDomain(shop);
    const rows = await this.database.session.findMany({
      where: { shop: shopDomain, revokedAt: null },
      take: 25,
      orderBy: [{ expires: "desc" }],
    });

    return rows.map(rowToSession);
  }

  async isReady(): Promise<boolean> {
    try {
      await Promise.all([
        this.database.shop.count(),
        this.database.session.count(),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}
