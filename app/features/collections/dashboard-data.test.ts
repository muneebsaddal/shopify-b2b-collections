import { describe, expect, it } from "vitest";

import {
  filterQueue,
  groupOutstandingByCurrency,
  queueItems,
  sortByPriority,
} from "./dashboard-data";

describe("collections dashboard data", () => {
  it("keeps outstanding totals partitioned by currency", () => {
    const totals = groupOutstandingByCurrency(queueItems);

    expect(totals.USD).toBeCloseTo(102468.88);
    expect(totals.CAD).toBe(4800);
  });

  it("applies status, currency, age, and company filters together", () => {
    const result = filterQueue(queueItems, {
      company: "beauty",
      status: "overdue",
      currency: "USD",
      age: "31-60",
    });

    expect(result.map((item) => item.company)).toEqual(["Luxe Glow Beauty"]);
  });

  it("puts due promises before the most overdue items", () => {
    const result = sortByPriority(queueItems);

    expect(result[0]?.company).toBe("Crown Beauty Co.");
    expect(result[1]?.company).toBe("Silk & Stone Spa");
  });
});
