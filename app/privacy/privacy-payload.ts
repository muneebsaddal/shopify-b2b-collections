import type { PrivacyRequestType } from "@prisma/client";

export type ParsedPrivacyPayload = {
  externalRequestId?: string;
  customerGid?: string;
  orderGids: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function numericId(value: unknown): string | undefined {
  if (
    (typeof value === "number" && Number.isSafeInteger(value)) ||
    (typeof value === "string" && /^\d+$/.test(value))
  ) {
    return String(value);
  }
  return undefined;
}

function gid(kind: "Customer" | "Order", value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith(`gid://shopify/${kind}/`)) {
    return value.slice(0, 255);
  }
  const id = numericId(value);
  return id ? `gid://shopify/${kind}/${id}` : undefined;
}

export function parsePrivacyPayload(
  type: PrivacyRequestType,
  payload: unknown,
): ParsedPrivacyPayload {
  const root = record(payload);
  const customer = record(root.customer);
  const request = record(root.data_request);
  const customerGid =
    gid("Customer", customer.admin_graphql_api_id) ??
    gid("Customer", customer.id) ??
    gid("Customer", root.customer_id);
  const requestedOrders =
    type === "CUSTOMER_DATA" ? root.orders_requested : root.orders_to_redact;
  const orderGids = Array.isArray(requestedOrders)
    ? requestedOrders.flatMap((value) => {
        const orderGid = gid("Order", value);
        return orderGid ? [orderGid] : [];
      })
    : [];
  const requestId = numericId(request.id);
  return {
    externalRequestId: requestId ? `shopify:${requestId}` : undefined,
    customerGid,
    orderGids: [...new Set(orderGids)].slice(0, 250),
  };
}
