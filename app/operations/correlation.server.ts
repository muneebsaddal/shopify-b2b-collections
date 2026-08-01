import { randomUUID } from "node:crypto";

const MAX_CORRELATION_ID_LENGTH = 128;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]+$/;

export function createCorrelationId(): string {
  return randomUUID();
}

export function correlationIdFromRequest(request: Request): string {
  const candidate =
    request.headers.get("x-shopify-webhook-id") ??
    request.headers.get("x-request-id");

  if (
    candidate &&
    candidate.length <= MAX_CORRELATION_ID_LENGTH &&
    SAFE_CORRELATION_ID.test(candidate)
  ) {
    return candidate;
  }

  return createCorrelationId();
}
