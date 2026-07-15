# ADR 0002: Shopify truth with a reconciled local projection

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

Collections screens need fast queries and workflow history, while Shopify owns
orders, payment terms and balances. Webhooks are duplicated, delayed, possibly
out of order and not guaranteed to be delivered.

## Decision

Shopify remains authoritative for payment and receivable facts. PostgreSQL
stores a minimal eventually consistent projection plus app-owned collection
state. Webhooks trigger idempotent targeted refreshes; hourly and daily GraphQL
reconciliation repairs drift. Freshness/reconciliation state is visible, and a
live Shopify check is mandatory immediately before reminder delivery.

## Consequences

- Dashboard and queue queries do not scan Shopify live.
- The system tolerates missed events and preserves workflow history.
- Sync/reconciliation is a first-class subsystem with operating cost.
- Temporary staleness is possible and must be disclosed; unsafe sending fails
  closed.

## Alternatives rejected

- **Live Shopify reads only:** slow, rate-limit intensive and cannot hold app
  workflow history.
- **Webhook-only mirror:** cannot guarantee convergence.
- **App-owned payment ledger:** conflicts with product boundaries and risks
  accounting divergence.
