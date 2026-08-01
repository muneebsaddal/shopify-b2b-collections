import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("platform foundation contracts", () => {
  it("keeps fixture dashboard code exclusive to the preview route", () => {
    const authenticatedRoute = readProjectFile("app/routes/app._index.tsx");
    const previewRoute = readProjectFile("app/routes/preview.tsx");

    expect(authenticatedRoute).toContain("AgingDashboard");
    expect(authenticatedRoute).toContain("loadAgingDashboard");
    expect(authenticatedRoute).not.toContain("CollectionsDashboard");
    expect(previewRoute).toContain("<CollectionsDashboard preview />");
    expect(previewRoute).toContain('searchParams.get("state") === "unsynced"');
  });

  it("generates GraphQL contracts for the runtime API version", () => {
    const graphqlConfig = readProjectFile(".graphqlrc.ts");

    expect(graphqlConfig).toContain("apiVersion: ApiVersion.July26");
    expect(graphqlConfig).not.toContain("ApiVersion.October25");
  });

  it("keeps schema migrations out of production process startup", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["docker-start"]).toBe("npm run start");
    expect(packageJson.scripts["release:migrate"]).toBe(
      "prisma migrate deploy",
    );
    expect(packageJson.scripts["docker-start"]).not.toContain("migrate");
  });

  it("enforces the active tenant boundary in the embedded app shell", () => {
    const appRoute = readProjectFile("app/routes/app.tsx");

    expect(appRoute).toContain("requireActiveShop(session.shop)");
  });
});
