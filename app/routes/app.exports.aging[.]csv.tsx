import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { createAgingCsvExport } from "../statements/statement-service.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const csv = await createAgingCsvExport(session.shop);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="aging-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
};
