import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("D1 runtime contracts", () => {
  it("ships a separately runnable, graceful worker", () => {
    const packageJson = JSON.parse(projectFile("package.json")) as {
      scripts: Record<string, string>;
    };
    const worker = projectFile("app/worker.ts");

    expect(packageJson.scripts.worker).toBe("tsx app/worker.ts");
    expect(worker).toContain('process.once("SIGTERM"');
    expect(worker).toContain('process.once("SIGINT"');
  });

  it("uses typed, internal-only job data with retry and dead-letter controls", () => {
    const adapter = projectFile("app/platform/jobs/pg-boss-adapter.server.ts");
    const contract = projectFile("app/platform/jobs/contracts.ts");

    expect(contract).toContain("shopId: string");
    expect(contract).not.toContain("email");
    expect(adapter).toContain("retryLimit: 3");
    expect(adapter).toContain("platform.dead-letter");
  });

  it("exposes liveness separately from database readiness", () => {
    expect(projectFile("app/routes/healthz.tsx")).not.toContain("prisma");
    expect(projectFile("app/routes/readyz.tsx")).toContain("SELECT 1");
  });
});
