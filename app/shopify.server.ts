import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import prisma from "./db.server";
import { createCorrelationId } from "./operations/correlation.server";
import { EncryptedPrismaSessionStorage } from "./platform/shopify/encrypted-session-storage.server";
import { activateInstalledShop } from "./tenancy/shop-lifecycle.server";
import { ShopRepository } from "./tenancy/shop-repository.server";
import { requestShopSynchronization } from "./sync/synchronization-request.server";

const encryptedSessionStorage = new EncryptedPrismaSessionStorage(prisma);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: encryptedSessionStorage,
  distribution: AppDistribution.AppStore,
  hooks: {
    afterAuth: async ({ session }) => {
      const correlationId = createCorrelationId();
      await activateInstalledShop(session, correlationId);
      const shop = await new ShopRepository(prisma).findByDomain(session.shop);
      if (shop?.scopesComplete) {
        await requestShopSynchronization({
          shopDomain: session.shop,
          correlationId,
        });
      }
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
