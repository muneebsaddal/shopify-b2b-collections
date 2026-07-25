# F2 Continuation Checkpoint

**Date:** 2026-07-26
**Status:** In progress

This checkpoint supersedes the older pause instructions in `README.md`. It
contains sanitized observations only. No Shopify resource ID, buyer identity,
email address, exact amount, raw payload, token, HMAC value, or local GraphiQL
key is retained.

## Basic-store fixture proof

The following Basic-store scenarios passed the narrow
`F2ReceivableOrderContract` and related company/contact contract:

- current Net terms;
- overdue unpaid;
- paid and zero outstanding;
- refunded;
- cancelled;
- edited;
- multi-currency;
- missing email.

The cancelled scenario established an important projection rule: Shopify can
retain payment-pending and unpaid flags after cancellation while current and
outstanding balances are zero. Cancellation must take precedence when
determining whether a receivable is actionable.

Plus partial-payment and negative-outstanding behavior remain pending.

## Public preview and webhook proof

The scaffold was missing `shopify.web.toml`. Shopify CLI therefore started a
proxy and GraphiQL without a React Router backend, making the local webhook
routes unreachable. The official frontend/backend web-process configuration
was restored and is protected by a regression test.

The default Cloudflare QUIC tunnel timed out on this network. Shopify CLI's
bundled tunnel client succeeded when forced to HTTP/2, and the corrected
preview became ready with exactly the four approved scopes.

An unsigned empty request to `app/scopes_update` returned HTTP 400 both locally
and through the public tunnel, proving route reachability and fail-closed
authentication. Shopify CLI accepted a signed sample webhook for delivery, but
the handler did not observe the sample during the final test window. Authentic
delivery is therefore still pending and no delivery pass is claimed.

Shopify's official `2026-07` webhook reference confirms the planned order,
refund, transaction, payment-term, payment-schedule, company, location,
contact, lifecycle, and compliance topics under the approved scopes. Topics
without durable handlers remain unregistered until S1.

Duplicate and reversed event processing is an S1 durable-intake implementation
proof, not an F2 route-capability claim.

## Token and App Pricing proof

Local inspection confirms:

- expiring offline access tokens are enabled;
- persisted sessions support access expiry, refresh token, and refresh expiry;
- the official React Router library contains automatic offline-session refresh.

Live token rotation and concurrent refresh behavior remain pending.

Current official Shopify documentation identifies Partner API
`activeSubscription` as the canonical Shopify App Pricing authority. Its
`2026-07` surface remains release candidate. Runtime proof requires a Partner
API client with Manage-apps permission and an active private test plan; those
items remain pending.

## Next gate

Do not begin F3 until the remaining F2 external proof is completed or resolved
through explicit architecture review:

1. Observe an authentic Shopify webhook at the corrected public handler.
2. Prove live offline-token rotation and concurrent refresh behavior.
3. Prove Plus partial-payment and negative-outstanding behavior, or record
   reviewed named blockers.
4. Prove Shopify App Pricing states through the Partner API private test plan.
