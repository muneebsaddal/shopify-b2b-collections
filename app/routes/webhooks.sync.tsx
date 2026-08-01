import type { ActionFunctionArgs } from "react-router";

import { correlationIdFromRequest } from "../operations/correlation.server";
import { PgBossJobAdapter } from "../platform/jobs/pg-boss-adapter.server";
import { authenticate } from "../shopify.server";
import {
  acceptSyncWebhook,
  assertWebhookSize,
  headersFromRequest,
  UnsupportedSyncWebhookError,
  WebhookPayloadTooLargeError,
} from "../sync/webhook-intake.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    assertWebhookSize(request);
    // Shopify's adapter verifies the raw-body HMAC before exposing payload.
    const { payload, shop, topic } = await authenticate.webhook(request);
    const accepted = await acceptSyncWebhook({
      shopDomain: shop,
      topic,
      payload,
      headers: headersFromRequest(request),
      correlationId: correlationIdFromRequest(request),
    });
    if (accepted)
      await new PgBossJobAdapter().enqueueSyncWork({
        workItemId: accepted.workItemId,
      });
    return new Response();
  } catch (error) {
    if (error instanceof WebhookPayloadTooLargeError)
      return new Response(null, { status: 413 });
    if (error instanceof UnsupportedSyncWebhookError)
      return new Response(null, { status: 400 });
    throw error;
  }
};
