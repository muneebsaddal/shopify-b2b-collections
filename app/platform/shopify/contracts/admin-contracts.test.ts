import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COMPANIES_CONTRACT_QUERY,
  RECEIVABLE_ORDER_CONTRACT_QUERY,
  RECEIVABLE_ORDERS_PAGE_CONTRACT_QUERY,
  SHOP_INSTALLATION_CONTRACT_QUERY,
} from "./admin-contracts";

const readProjectFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const config = readProjectFile("shopify.app.toml");
const contracts = [
  SHOP_INSTALLATION_CONTRACT_QUERY,
  COMPANIES_CONTRACT_QUERY,
  RECEIVABLE_ORDER_CONTRACT_QUERY,
  RECEIVABLE_ORDERS_PAGE_CONTRACT_QUERY,
].join("\n");

describe("F2 Shopify platform contracts", () => {
  it("requests exactly the approved read-only scopes", () => {
    const scopeLine = config.match(/^scopes = "([^"]+)"$/m)?.[1];

    expect(scopeLine?.split(",").sort()).toEqual(
      [
        "read_all_orders",
        "read_customers",
        "read_orders",
        "read_payment_terms",
      ].sort(),
    );
    expect(config).not.toMatch(/\bwrite_[a-z_]+\b/);
  });

  it("limits protected customer selections to identifiers and email", () => {
    const forbiddenCustomerFields = [
      "addresses",
      "defaultAddress",
      "displayName",
      "firstName",
      "lastName",
      "marketingState",
      "metafields",
      "note",
      "phone",
    ];

    expect(contracts).toContain("defaultEmailAddress");
    expect(contracts).toContain("emailAddress");
    for (const field of forbiddenCustomerFields) {
      expect(contracts).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("selects authoritative balance, schedule, refund, and transaction facts", () => {
    for (const field of [
      "totalOutstandingSet",
      "paymentSchedules",
      "balanceDue",
      "totalBalance",
      "refunds",
      "transactions",
      "currentTotalPriceSet",
    ]) {
      expect(contracts).toContain(field);
    }
    expect(contracts).not.toMatch(/\n\s+amount\s*\n\s+due\b/);
  });
});
