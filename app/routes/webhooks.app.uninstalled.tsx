import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { correlationIdFromRequest } from "../operations/correlation.server";
import { scheduleUninstallCleanup } from "../privacy/privacy-service.server";
import { uninstallShop } from "../tenancy/shop-lifecycle.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  const correlationId = correlationIdFromRequest(request);
  const uninstalled = await uninstallShop({
    shopDomain: shop,
    correlationId,
  });
  if (uninstalled) {
    await scheduleUninstallCleanup({
      ...uninstalled,
      correlationId,
    });
  }

  return new Response();
};
