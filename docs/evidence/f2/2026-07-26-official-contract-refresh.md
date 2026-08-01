# F2 Official Contract Refresh

**Date:** 2026-07-26
**Status:** Documentation proof complete; runtime App Pricing proof pending

This checkpoint records public Shopify documentation only. It contains no
organization, app, shop, plan, session, or credential identifiers.

## Shopify App Pricing

- Partner API `2026-07` is documented as the latest version.
- `activeSubscription(appId:, shopId:)` is the canonical live subscription
  query for a public app. It returns `null` when no active Shopify App Pricing
  contract exists.
- App and subscription event history includes created, updated, scheduled
  cancellation, cancelled, frozen, and unfrozen events.
- Access to app resources and subscription history requires a Partner API
  client with Manage-apps permission.
- Only an organization owner can create or manage that client.
- Shopify App Pricing provides a $0 private test plan for billing integration
  proof.

Runtime state transitions remain unproved until the required Partner API client
and private test plan exist.

## Expiring offline tokens

- Public apps created on or after 2026-04-01 must use expiring offline tokens.
- An access token expires after 60 minutes and its refresh token after 90 days.
- A successful refresh rotates both values. A retired access token remains
  valid until its original expiry, but the previous refresh token is retired.
- Shopify documents retry behavior for an interrupted offline-token refresh,
  but the application must still prove its own concurrent persistence behavior.

The linked development installation proved live single-request rotation and
convergence under two concurrent authenticated requests. See
[`2026-07-26-token-rotation-proof.md`](2026-07-26-token-rotation-proof.md).

## Official references

- https://shopify.dev/docs/api/partner/2026-07
- https://shopify.dev/docs/api/partner/2026-07/queries/activeSubscription
- https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing
- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
