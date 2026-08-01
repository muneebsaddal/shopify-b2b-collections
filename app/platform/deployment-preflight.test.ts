import { describe, expect, it } from "vitest";

import { validateDeploymentEnvironment } from "./deployment/preflight";

const keyA = Buffer.alloc(32, 1).toString("base64");
const keyB = Buffer.alloc(32, 2).toString("base64");

function validEnvironment(): Record<string, string> {
  return {
    DEPLOYMENT_ENVIRONMENT: "staging",
    NODE_ENV: "production",
    PORT: "3000",
    DATABASE_URL: "postgresql://app:secret@private-db:5432/app",
    SESSION_ENCRYPTION_KEY: keyA,
    SESSION_ENCRYPTION_KEY_ID: "staging-v1",
    PRIVACY_TOMBSTONE_KEY: keyB,
    SHOPIFY_API_KEY: "api-key",
    SHOPIFY_API_SECRET: "api-secret",
    SHOPIFY_APP_URL: "https://b2b-ar-staging.onrender.com",
    SHOPIFY_PARTNER_ORGANIZATION_ID: "12345",
    SHOPIFY_PARTNER_ACCESS_TOKEN: "partner-token",
    SHOPIFY_PARTNER_APP_GID: "gid://partners/App/12345",
    SHOPIFY_APP_HANDLE: "b2b-ar-staging",
    SHOPIFY_PLAN_HANDLE_FREE: "free",
    SHOPIFY_PLAN_HANDLE_STARTER: "starter",
    SHOPIFY_PLAN_HANDLE_GROWTH: "growth",
    SHOPIFY_PLAN_HANDLE_SCALE: "scale",
    SHOPIFY_PLAN_HANDLE_TEST: "private-test",
    POSTMARK_SERVER_TOKEN: "postmark-token",
    POSTMARK_FROM_EMAIL: "collections@example.test",
    POSTMARK_MESSAGE_STREAM: "b2b-ar-staging",
    POSTMARK_WEBHOOK_TOKEN: "a".repeat(32),
    RELEASE_VERSION: "0123456789abcdef0123456789abcdef01234567",
    SCOPES:
      "read_orders,read_all_orders,read_payment_terms,read_customers",
  };
}

describe("deployment preflight", () => {
  it("accepts an isolated production-shaped staging environment", () => {
    expect(validateDeploymentEnvironment(validEnvironment())).toEqual([]);
  });

  it("rejects local endpoints, extra scopes, shared keys, and default streams", () => {
    const environment = validEnvironment();
    environment.DATABASE_URL = "postgresql://app:secret@localhost:5432/app";
    environment.SHOPIFY_APP_URL = "http://localhost:3000";
    environment.SCOPES += ",write_orders";
    environment.PRIVACY_TOMBSTONE_KEY = environment.SESSION_ENCRYPTION_KEY;
    environment.POSTMARK_MESSAGE_STREAM = "outbound";

    const issues = validateDeploymentEnvironment(environment);
    expect(issues).toContain("DATABASE_URL must be a non-local PostgreSQL URL");
    expect(issues).toContain("SHOPIFY_APP_URL must be a non-local HTTPS origin");
    expect(issues).toContain(
      "SCOPES must exactly match the approved least-privilege scope set",
    );
    expect(issues).toContain(
      "PRIVACY_TOMBSTONE_KEY must differ from SESSION_ENCRYPTION_KEY",
    );
    expect(issues).toContain(
      "POSTMARK_MESSAGE_STREAM must be isolated from the default outbound stream",
    );
  });

  it("reports missing provider and billing configuration without values", () => {
    const environment = validEnvironment();
    delete environment.POSTMARK_SERVER_TOKEN;
    delete environment.SHOPIFY_PARTNER_ACCESS_TOKEN;

    expect(validateDeploymentEnvironment(environment)).toEqual(
      expect.arrayContaining([
        "POSTMARK_SERVER_TOKEN is required",
        "SHOPIFY_PARTNER_ACCESS_TOKEN is required",
      ]),
    );
  });
});
