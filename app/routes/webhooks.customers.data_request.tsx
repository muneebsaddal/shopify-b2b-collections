import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  // Durable privacy-request persistence is implemented in task P1. Until then,
  // authenticate and acknowledge the platform contract without logging payloads.
  console.info("privacy_webhook_received", { shop, topic });

  return new Response();
};
