import { describe, expect, it } from "vitest";

import { agingForDueDate, buildAgingDashboard } from "./aging";

describe("aging engine", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");

  it("uses merchant calendar dates rather than elapsed 24-hour periods", () => {
    expect(
      agingForDueDate(new Date("2026-07-25T23:30:00.000Z"), now, "Asia/Karachi"),
    ).toMatchObject({ daysOverdue: 0, bucket: "CURRENT", dueDate: "2026-07-26" });
  });

  it("assigns the documented boundaries", () => {
    expect(agingForDueDate(new Date("2026-07-25T00:00:00Z"), now, "UTC").bucket).toBe("ONE_TO_THIRTY");
    expect(agingForDueDate(new Date("2026-06-26T00:00:00Z"), now, "UTC").bucket).toBe("ONE_TO_THIRTY");
    expect(agingForDueDate(new Date("2026-06-25T00:00:00Z"), now, "UTC").bucket).toBe("THIRTY_ONE_TO_SIXTY");
    expect(agingForDueDate(new Date("2026-04-27T00:00:00Z"), now, "UTC").bucket).toBe("SIXTY_ONE_TO_NINETY");
    expect(agingForDueDate(new Date("2026-04-26T00:00:00Z"), now, "UTC").bucket).toBe("NINETY_PLUS");
  });

  it("does not mix currencies and makes missing, zero, and negative state reviewable", () => {
    const dashboard = buildAgingDashboard({
      now,
      timezone: "UTC",
      receivables: [
        { id: "usd", companyId: "company-a", companyName: "A", orderName: "#1", status: "OPEN", outstandingAmount: "10.25", originalTotal: "10.25", currency: "USD", dueAt: new Date("2026-07-01T00:00:00Z"), lastObservedAt: now },
        { id: "cad", companyId: "company-b", companyName: "B", orderName: "#2", status: "OPEN", outstandingAmount: "20", originalTotal: "20", currency: "CAD", dueAt: new Date("2026-07-30T00:00:00Z"), lastObservedAt: now },
        { id: "missing", companyId: "company-c", companyName: "C", orderName: "#3", status: "OPEN", outstandingAmount: "30", originalTotal: "30", currency: "USD", dueAt: null, lastObservedAt: now },
        { id: "zero", companyId: "company-d", companyName: "D", orderName: "#4", status: "OPEN", outstandingAmount: "0", originalTotal: "10", currency: "USD", dueAt: null, lastObservedAt: now },
        { id: "negative", companyId: "company-e", companyName: "E", orderName: "#5", status: "OPEN", outstandingAmount: "-2", originalTotal: "10", currency: "USD", dueAt: null, lastObservedAt: now },
      ],
    });

    expect(dashboard.currencies).toEqual([
      expect.objectContaining({ currency: "CAD", totalOutstanding: "20", overdue: "0" }),
      expect.objectContaining({ currency: "USD", totalOutstanding: "40.25", overdue: "10.25" }),
    ]);
    expect(dashboard.missingSchedule).toEqual({ count: 1, byCurrency: { USD: "30" } });
    expect(dashboard.excluded).toEqual({ zeroBalance: 1, negativeBalance: 1 });
  });
});
