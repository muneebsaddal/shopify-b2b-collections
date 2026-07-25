# F2 webhook tunnel blocker

**Date:** 2026-07-26  
**Task:** F2  
**Status:** Named external blocker

## Proven

- A real `app/scopes_update` event was emitted after changing the development
  installation's required scopes.
- Shopify attempted delivery repeatedly using webhook API version `2026-07`.
- The active public development tunnel served the app root successfully and
  rejected an unsigned request to `/webhooks/app/scopes_update` with the
  expected `400` response.
- Shopify remained the authority for granted scopes. After the reversible test,
  a narrow Admin GraphQL query confirmed exactly the four approved handles:
  `read_orders`, `read_all_orders`, `read_payment_terms`, and `read_customers`.
- The local synthetic offline-session scope field was reconciled to those four
  authoritative handles.

## Blocker

Real webhook attempts received Cloudflare `530` responses before reaching the
application handler. A separately managed quick tunnel on a fixed local port
was also publicly reachable, but Cloudflare recorded the Shopify request as
canceled upstream and Shopify again recorded `530`. No handler success is
claimed.

This is recorded as a development-tunnel transport blocker. Resolve it with a
durable hosted endpoint or reliable named tunnel before relying on external
webhook delivery proof. Webhook correctness must still be covered by
idempotency, duplicate, and out-of-order integration tests when lifecycle
persistence is implemented.

## Data handling

No webhook body, HMAC value, access token, shop domain, Shopify resource ID,
webhook ID, event ID, buyer data, or protected customer payload is retained in
this evidence.
