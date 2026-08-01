import { describe, expect, it } from "vitest";

import { normalizeShopDomain } from "./shop-domain";

describe("normalizeShopDomain", () => {
  it("normalizes a valid myshopify domain", () => {
    expect(normalizeShopDomain("  Example-Shop.myshopify.com. ")).toBe(
      "example-shop.myshopify.com",
    );
  });

  it.each([
    "https://example.myshopify.com",
    "example.com",
    "-example.myshopify.com",
    "example-.myshopify.com",
    "example.myshopify.com.attacker.test",
  ])("rejects an invalid shop domain: %s", (domain) => {
    expect(() => normalizeShopDomain(domain)).toThrow(
      "Invalid Shopify shop domain",
    );
  });
});
