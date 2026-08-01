import { describe, expect, it } from "vitest";

import {
  isInScopeReceivable,
  statusForOrder,
  type OrderNode,
} from "./shopify-projection.server";

function order(overrides: Partial<OrderNode> = {}): OrderNode {
  return {
    id: "gid://shopify/Order/1",
    totalOutstandingSet: {
      shopMoney: { amount: "100.00", currencyCode: "USD" },
    },
    totalPriceSet: {
      shopMoney: { amount: "100.00", currencyCode: "USD" },
    },
    purchasingEntity: { company: { id: "gid://shopify/Company/1" } },
    paymentTerms: { paymentSchedules: { nodes: [] } },
    ...overrides,
  };
}

describe("Shopify receivable projection rules", () => {
  it("requires both B2B company ownership and payment terms", () => {
    expect(isInScopeReceivable(order())).toBe(true);
    expect(isInScopeReceivable(order({ paymentTerms: null }))).toBe(false);
    expect(
      isInScopeReceivable(order({ purchasingEntity: undefined })),
    ).toBe(false);
  });

  it("uses decimal-safe authoritative status facts", () => {
    expect(
      statusForOrder(
        order({
          totalOutstandingSet: {
            shopMoney: { amount: "0.0000", currencyCode: "USD" },
          },
        }),
      ),
    ).toBe("PAID");
    expect(
      statusForOrder(
        order({
          totalOutstandingSet: {
            shopMoney: { amount: "0", currencyCode: "USD" },
          },
          totalRefundedSet: {
            shopMoney: { amount: "100", currencyCode: "USD" },
          },
        }),
      ),
    ).toBe("REFUNDED");
    expect(statusForOrder(order({ cancelledAt: "2026-07-26T00:00:00Z" }))).toBe(
      "CANCELED",
    );
  });
});
