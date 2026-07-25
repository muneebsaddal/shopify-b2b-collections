import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UnsyncedDashboard } from "./UnsyncedDashboard";

describe("authenticated unsynced dashboard", () => {
  it("shows an honest onboarding state without fixture balances", () => {
    const markup = renderToStaticMarkup(<UnsyncedDashboard />);

    expect(markup).toContain("Not synchronized");
    expect(markup).toContain("No financial data is shown.");
    expect(markup).toContain("Unavailable until reconciliation");
    expect(markup).not.toContain("Fully reconciled");
    expect(markup).not.toContain("Crown Beauty Co.");
    expect(markup).not.toContain("$247,350.18");
  });
});
