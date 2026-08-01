import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { correlationIdFromRequest } from "../operations/correlation.server";
import { PgBossJobAdapter } from "../platform/jobs/pg-boss-adapter.server";
import { acceptPrivacyWebhook } from "../privacy/privacy-service.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(contentLength) || contentLength > 256 * 1024) {
    return new Response(null, { status: 413 });
  }
  const { shop, payload } = await authenticate.webhook(request);
  const webhookId = request.headers.get("x-shopify-webhook-id");
  if (!webhookId || webhookId.length > 255) {
    return new Response(null, { status: 400 });
  }
  const correlationId = correlationIdFromRequest(request);
  const accepted = await acceptPrivacyWebhook({
    shopDomain: shop,
    type: "CUSTOMER_REDACT",
    payload,
    webhookId,
    correlationId,
  });
  if (accepted) {
    await new PgBossJobAdapter().enqueuePrivacyProcess({
      privacyRequestId: accepted.requestId,
      correlationId,
    });
  }

  return new Response();
};
