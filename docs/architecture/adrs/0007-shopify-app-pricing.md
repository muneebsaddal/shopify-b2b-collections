# ADR 0007: Shopify App Pricing as billing authority

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

The public app needs free, monthly and annual plans with self-serve upgrades and
downgrades. Shopify now recommends Shopify App Pricing and hosts plan selection,
billing lifecycle and standard pricing behavior.

## Decision

Define plans in Shopify App Pricing. Verify active subscription state through
the Partner API and cache a short-lived entitlement snapshot. UI and worker use
one domain entitlement service. Use Shopify's $0 private test plan for billing
tests. Do not create legacy Billing API recurring charges.

## Consequences

- Less custom billing code and a familiar merchant checkout.
- Shopify/Partner API remains the subscription authority.
- Entitlement refresh, stale-state behavior and lifecycle diagnostics still
  require implementation.
- Product plan constraints must fit current Shopify App Pricing capabilities.

## Alternatives rejected

- **Legacy Billing API:** more custom state and a legacy path without MVP need.
- **External Stripe checkout:** inappropriate for a public App Store app and a
  worse merchant experience.

## Reference

- [Shopify App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing)
