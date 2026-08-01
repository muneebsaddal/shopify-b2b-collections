import { afterEach, describe, expect, it } from "vitest";

import {
  fingerprintScopes,
  hasRequiredScopes,
  normalizeScopes,
} from "./scope-policy";

const originalScopes = process.env.SCOPES;

afterEach(() => {
  if (originalScopes === undefined) {
    delete process.env.SCOPES;
  } else {
    process.env.SCOPES = originalScopes;
  }
});

describe("scope policy", () => {
  it("normalizes, deduplicates, and sorts scopes", () => {
    expect(normalizeScopes("read_orders, read_customers,read_orders")).toEqual([
      "read_customers",
      "read_orders",
    ]);
  });

  it("fails closed when a required scope is missing", () => {
    process.env.SCOPES = "read_orders,read_customers";

    expect(hasRequiredScopes(["read_orders"])).toBe(false);
    expect(hasRequiredScopes(["read_customers", "read_orders"])).toBe(true);
  });

  it("produces a stable fingerprint independent of scope order", () => {
    expect(fingerprintScopes(["read_orders", "read_customers"])).toBe(
      fingerprintScopes(["read_customers", "read_orders"]),
    );
  });
});
