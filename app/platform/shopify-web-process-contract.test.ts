import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Shopify local web process contract", () => {
  it("starts the React Router frontend and backend for app dev", () => {
    const webConfig = readProjectFile("shopify.web.toml");

    expect(webConfig).toContain('roles = ["frontend", "backend"]');
    expect(webConfig).toContain('dev = "npm exec react-router dev"');
    expect(webConfig).toContain(
      'webhooks_path = "/webhooks/app/uninstalled"',
    );
  });
});
