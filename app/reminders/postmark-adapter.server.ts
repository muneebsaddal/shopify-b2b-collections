export type ProviderSubmission =
  | { kind: "accepted"; messageId: string }
  | { kind: "definite-failure"; code: string }
  | { kind: "unknown"; code: string };

export class PostmarkAdapter {
  async submit(input: {
    to: string;
    replyTo: string;
    subject: string;
    body: string;
    metadata: Record<string, string>;
  }): Promise<ProviderSubmission> {
    const token = process.env.POSTMARK_SERVER_TOKEN;
    const from = process.env.POSTMARK_FROM_EMAIL;
    if (!token || !from)
      return { kind: "definite-failure", code: "provider_not_configured" };

    try {
      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-postmark-server-token": token,
        },
        body: JSON.stringify({
          From: from,
          To: input.to,
          ReplyTo: input.replyTo,
          Subject: input.subject,
          TextBody: input.body,
          MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
          Metadata: input.metadata,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json().catch(() => ({}))) as {
        MessageID?: string;
        ErrorCode?: number;
      };
      if (response.ok && result.MessageID)
        return { kind: "accepted", messageId: result.MessageID };
      return {
        kind: "definite-failure",
        code: `provider_rejected_${result.ErrorCode ?? response.status}`,
      };
    } catch {
      return { kind: "unknown", code: "provider_submission_ambiguous" };
    }
  }

  async sendVerification(email: string, code: string): Promise<void> {
    const submission = await this.submit({
      to: email,
      replyTo: process.env.POSTMARK_FROM_EMAIL || email,
      subject: "Verify your collections reply-to address",
      body: `Your verification code is ${code}. It expires in 30 minutes.`,
      metadata: { purpose: "reply_to_verification" },
    });
    if (submission.kind !== "accepted")
      throw new Error("reply_to_verification_delivery_failed");
  }
}
