import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logger.server";

describe("structured logger privacy boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes only allowlisted fields even when runtime input has extras", () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    logger.info({
      event: "stage4.logger_probe",
      correlationId: "correlation-safe",
      buyerEmail: "seeded-buyer@example.test",
      token: "seeded-token",
      webhookBody: "seeded-webhook-body",
    } as never);

    const output = String(write.mock.calls[0]?.[0]);
    expect(output).toContain("stage4.logger_probe");
    expect(output).toContain("correlation-safe");
    expect(output).not.toContain("seeded-buyer@example.test");
    expect(output).not.toContain("seeded-token");
    expect(output).not.toContain("seeded-webhook-body");
  });
});
