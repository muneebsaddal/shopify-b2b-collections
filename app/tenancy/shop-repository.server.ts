import type {
  Prisma,
  PrismaClient,
  Shop,
  ShopStatus,
} from "@prisma/client";

import { normalizeShopDomain } from "./shop-domain";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export class InactiveShopError extends Error {
  constructor() {
    super("Shop is not active");
  }
}

export class ShopRepository {
  constructor(private readonly database: DatabaseClient) {}

  findByDomain(shopDomain: string): Promise<Shop | null> {
    return this.database.shop.findUnique({
      where: { shopDomain: normalizeShopDomain(shopDomain) },
    });
  }

  async requireActiveById(shopId: string): Promise<Shop> {
    const shop = await this.database.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop || shop.status !== "ACTIVE") {
      throw new InactiveShopError();
    }

    return shop;
  }

  setStatus(
    shopId: string,
    expectedStatus: ShopStatus,
    status: ShopStatus,
  ) {
    return this.database.shop.updateMany({
      where: { id: shopId, status: expectedStatus },
      data: {
        status,
        version: { increment: 1 },
      },
    });
  }
}

export class ScopedShopRepository {
  constructor(
    private readonly database: DatabaseClient,
    readonly shopId: string,
  ) {}

  get(): Promise<Shop | null> {
    return this.database.shop.findUnique({
      where: { id: this.shopId },
    });
  }

  requireActive(): Promise<Shop> {
    return new ShopRepository(this.database).requireActiveById(this.shopId);
  }
}
