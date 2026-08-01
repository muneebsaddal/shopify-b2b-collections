import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AgingDashboard } from "../features/receivables/AgingDashboard";
import {
  agingFiltersFromUrl,
  loadAgingDashboard,
} from "../features/receivables/aging-dashboard.server";
import { correlationIdFromRequest } from "../operations/correlation.server";
import { authenticate } from "../shopify.server";
import {
  requestShopSynchronization,
  SynchronizationRequestError,
} from "../sync/synchronization-request.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const dashboard = await loadAgingDashboard(
    session.shop,
    agingFiltersFromUrl(new URL(request.url)),
  );

  if (!dashboard) throw new Response("Shop is inactive", { status: 403 });
  return dashboard;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  if (formData.get("intent") !== "synchronize") {
    throw new Response("Unsupported action", { status: 400 });
  }
  try {
    await requestShopSynchronization({
      shopDomain: session.shop,
      correlationId: correlationIdFromRequest(request),
      requestedByMerchant: true,
    });
  } catch (error) {
    if (error instanceof SynchronizationRequestError) {
      throw new Response(error.message, { status: 409 });
    }
    throw error;
  }
  return redirect("/app?sync=requested");
};

export default function Index() {
  return <AgingDashboard data={useLoaderData<typeof loader>()} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
