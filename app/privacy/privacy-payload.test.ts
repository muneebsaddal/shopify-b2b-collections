import { describe, expect, it } from "vitest";

import { parsePrivacyPayload } from "./privacy-payload";

describe("privacy webhook minimization", () => {
  it("keeps only stable subject IDs and ignores protected values", () => {
    expect(
      parsePrivacyPayload("CUSTOMER_DATA", {
        customer: {
          id: 191167,
          email: "must-not-be-retained@example.com",
          phone: "555-0100",
        },
        orders_requested: [299938, "gid://shopify/Order/280263"],
        data_request: { id: 9999 },
      }),
    ).toEqual({
      externalRequestId: "shopify:9999",
      customerGid: "gid://shopify/Customer/191167",
      orderGids: [
        "gid://shopify/Order/299938",
        "gid://shopify/Order/280263",
      ],
    });
  });

  it("bounds malformed order subjects", () => {
    const parsed = parsePrivacyPayload("CUSTOMER_REDACT", {
      customer: { id: "not-an-id" },
      orders_to_redact: [null, {}, "bad"],
    });
    expect(parsed.customerGid).toBeUndefined();
    expect(parsed.orderGids).toEqual([]);
  });
});
