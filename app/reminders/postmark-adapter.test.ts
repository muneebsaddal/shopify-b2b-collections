import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostmarkAdapter } from "./postmark-adapter.server";

const originalToken = process.env.POSTMARK_SERVER_TOKEN;
const originalFrom = process.env.POSTMARK_FROM_EMAIL;

function submissionInput() {
  return {
    to: "synthetic-recipient@example.test",
    replyTo: "synthetic-merchant@example.test",
    subject: "Stage 4 provider contract",
    body: "Synthetic message body",
    metadata: { deliveryId: "stage4-delivery" },
  };
}

describe("Postmark provider submission contract", () => {
  beforeEach(() => {
    process.env.POSTMARK_SERVER_TOKEN = "stage4-server-token";
    process.env.POSTMARK_FROM_EMAIL = "collections@example.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalToken === undefined) delete process.env.POSTMARK_SERVER_TOKEN;
    else process.env.POSTMARK_SERVER_TOKEN = originalToken;
    if (originalFrom === undefined) delete process.env.POSTMARK_FROM_EMAIL;
    else process.env.POSTMARK_FROM_EMAIL = originalFrom;
  });

  it("fails definitely and closed when provider configuration is absent", async () => {
    delete process.env.POSTMARK_SERVER_TOKEN;
    delete process.env.POSTMARK_FROM_EMAIL;

    await expect(new PostmarkAdapter().submit(submissionInput())).resolves.toEqual({
      kind: "definite-failure",
      code: "provider_not_configured",
    });
  });

  it("classifies a transport timeout as ambiguous instead of retry-safe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(new PostmarkAdapter().submit(submissionInput())).resolves.toEqual({
      kind: "unknown",
      code: "provider_submission_ambiguous",
    });
  });

  it("classifies an explicit provider rejection as a definite failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ErrorCode: 406 }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(new PostmarkAdapter().submit(submissionInput())).resolves.toEqual({
      kind: "definite-failure",
      code: "provider_rejected_406",
    });
  });

  it("requires a provider message ID before treating a response as accepted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ MessageID: "stage4-message" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(new PostmarkAdapter().submit(submissionInput())).resolves.toEqual({
      kind: "accepted",
      messageId: "stage4-message",
    });
  });
});
