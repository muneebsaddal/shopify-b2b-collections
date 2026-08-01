import { tmpdir } from "node:os";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const port = 3_017;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: path.join(tmpdir(), "b2b-ar-stage4-playwright"),
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev:preview -- --host 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      SHOPIFY_APP_URL: `http://127.0.0.1:${port}`,
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || "stage4-api-key",
      SHOPIFY_API_SECRET:
        process.env.SHOPIFY_API_SECRET || "stage4-api-secret",
      SCOPES:
        process.env.SCOPES ||
        "read_all_orders,read_customers,read_orders,read_payment_terms",
    },
    url: `http://127.0.0.1:${port}/preview`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
