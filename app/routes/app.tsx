import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { requireActiveShop } from "../tenancy/shop-lifecycle.server";
import { InactiveShopError } from "../tenancy/shop-repository.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    await requireActiveShop(session.shop);
  } catch (error) {
    if (error instanceof InactiveShopError) {
      throw new Response("Shop is inactive", { status: 403 });
    }
    throw error;
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <nav
        aria-label="Application"
        style={{
          display: "flex",
          gap: "1rem",
          padding: "0.75rem 2rem 0",
          flexWrap: "wrap",
        }}
      >
        <Link to="/app">Aging</Link>
        <Link to="/app/collections">Collections</Link>
        <Link to="/app/reminders">Reminders</Link>
        <Link to="/app/settings">Settings</Link>
      </nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
