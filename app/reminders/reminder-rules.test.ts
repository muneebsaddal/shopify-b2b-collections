import { describe, expect, it } from "vitest";

import {
  isStageDue,
  renderReminderTemplate,
  resolvedStageInstant,
  validateEmailHeader,
  validateReminderTemplate,
} from "./reminder-rules";

describe("reminder rules", () => {
  it("renders only the approved collection variables", () => {
    expect(
      renderReminderTemplate(
        "{{companyName}} owes {{outstandingAmount}} {{currency}} for {{orderName}} on {{dueDate}}",
        {
          companyName: "Example",
          outstandingAmount: "12.00",
          currency: "USD",
          orderName: "#1001",
          dueDate: "2026-07-26",
        },
      ),
    ).toBe("Example owes 12.00 USD for #1001 on 2026-07-26");
    expect(() => validateReminderTemplate("Hello {{contactName}}")).toThrow(
      "template_variable_not_allowed",
    );
  });

  it("rejects header injection", () => {
    expect(() => validateEmailHeader("Invoice\r\nBcc: attacker@example.com", 200))
      .toThrow("email_header_invalid");
  });

  it("does not plan a stage before its resolved instant", () => {
    const due = new Date("2026-07-20T12:00:00.000Z");
    expect(isStageDue(due, 7, new Date("2026-07-27T08:59:59.000Z"))).toBe(false);
    expect(isStageDue(due, 7, new Date("2026-07-27T09:00:00.000Z"))).toBe(true);
  });

  it("resolves a merchant-local send instant across a DST boundary", () => {
    expect(
      resolvedStageInstant(
        new Date("2026-03-08T04:00:00.000Z"),
        1,
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z");
  });
});
