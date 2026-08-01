import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { correlationIdFromRequest } from "../operations/correlation.server";
import { updateShopScopes } from "../tenancy/shop-lifecycle.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, shop } = await authenticate.webhook(request);

  const current = payload.current as string[];
  await updateShopScopes({
    shopDomain: shop,
    scopes: current,
    sessionId: session?.id,
    correlationId: correlationIdFromRequest(request),
  });

  return new Response();
};
