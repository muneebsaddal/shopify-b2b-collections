import type { ActionFunctionArgs } from "react-router";

import {
  ingestPostmarkEvent,
  ProviderWebhookSafetyBlockedError,
  verifyPostmarkWebhook,
} from "../reminders/delivery-service.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    verifyPostmarkWebhook(request);
  } catch {
    return new Response(null, { status: 401 });
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isSafeInteger(contentLength) || contentLength > 256 * 1024)
    return new Response(null, { status: 413 });
  try {
    await ingestPostmarkEvent(await request.json());
  } catch (error) {
    if (error instanceof ProviderWebhookSafetyBlockedError) {
      return new Response(null, { status: 503 });
    }
    throw error;
  }
  return new Response(null, { status: 200 });
};
