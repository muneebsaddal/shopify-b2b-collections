import type { LoaderFunctionArgs } from "react-router";

import { correlationIdFromRequest } from "../operations/correlation.server";
import { authenticate } from "../shopify.server";
import { createCompanyStatement } from "../statements/statement-service.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!params.companyId) throw new Response("Not found", { status: 404 });
  const statement = await createCompanyStatement({
    shopDomain: session.shop,
    companyId: params.companyId,
    correlationId: correlationIdFromRequest(request),
  });
  return new Response(statement.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${statement.filename}"`,
      "cache-control": "private, no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
};
