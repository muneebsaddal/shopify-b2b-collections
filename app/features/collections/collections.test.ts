import { describe, expect, it } from "vitest";

import { buildDailyCollectionQueue, buildReliabilityFacts } from "./collections";

describe("daily collections queue", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");

  it("uses a stable, explainable priority without mixing currency totals", () => {
    const queue = buildDailyCollectionQueue({
      now,
      timezone: "UTC",
      candidates: [
        { id: "usd", companyId: "company-a", companyName: "A", orderName: "#1", outstandingAmount: "100", currency: "USD", dueAt: new Date("2026-07-20T00:00:00Z"), promises: [], actions: [] },
        { id: "cad", companyId: "company-b", companyName: "B", orderName: "#2", outstandingAmount: "10000", currency: "CAD", dueAt: new Date("2026-07-25T00:00:00Z"), promises: [{ status: "OPEN", promisedAt: new Date("2026-07-23T00:00:00Z") }], actions: [] },
      ],
    });

    expect(queue.map((item) => item.id)).toEqual(["cad", "usd"]);
    expect(queue[0].priorityReasons).toContain("Promise overdue by 3 days");
    expect(queue[0].currency).toBe("CAD");
  });

  it("omits future snoozes and same-day dismissals", () => {
    const queue = buildDailyCollectionQueue({
      now,
      timezone: "UTC",
      candidates: [
        { id: "snoozed", companyId: null, companyName: null, orderName: "#1", outstandingAmount: "1", currency: "USD", dueAt: new Date("2026-07-01T00:00:00Z"), promises: [], actions: [{ type: "SNOOZED", createdAt: now, effectiveAt: new Date("2026-07-27T00:00:00Z") }] },
        { id: "dismissed", companyId: null, companyName: null, orderName: "#2", outstandingAmount: "1", currency: "USD", dueAt: new Date("2026-07-01T00:00:00Z"), promises: [], actions: [{ type: "DAILY_DISMISSED", createdAt: now, effectiveAt: null }] },
      ],
    });

    expect(queue).toEqual([]);
  });
});

describe("reliability facts", () => {
  it("reports payment facts without producing a score", () => {
    expect(
      buildReliabilityFacts({
        timezone: "UTC",
        brokenPromiseCount: 2,
        paidInvoices: [
          { dueAt: new Date("2026-07-01T00:00:00Z"), paidAt: new Date("2026-07-01T00:00:00Z") },
          { dueAt: new Date("2026-07-01T00:00:00Z"), paidAt: new Date("2026-07-04T00:00:00Z") },
        ],
      }),
    ).toEqual({ eligibleInvoiceCount: 2, paidLateCount: 1, medianDaysLate: 3, averageDaysLate: 3, brokenPromiseCount: 2 });
  });
});
