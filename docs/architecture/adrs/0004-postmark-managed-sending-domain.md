# ADR 0004: Postmark with an app-managed sending domain

- **Status:** Proposed
- **Date:** 2026-07-14

## Context

The pilot needs transactional email, delivery/bounce/complaint feedback,
suppression handling and predictable setup. Per-merchant domain verification
would add onboarding and support work. Merchant identity is still needed for
replies.

## Decision

Use Postmark transactional message streams from an app-managed SPF/DKIM-aligned
domain. Use a validated merchant address as Reply-To. Persist provider message
IDs and authenticated delivery events. Hard bounces and complaints create local
suppressions. Custom merchant From domains are deferred.

Postmark acceptance is not assumed idempotent. The database delivery reservation
is the send guard; a provider timeout with ambiguous acceptance becomes
`UNKNOWN` and is never automatically resent.

## Consequences

- Pilot onboarding and deliverability operations are simpler.
- Recipients see the application sending domain, with replies routed to the
  merchant.
- Provider reputation is shared and must be monitored conservatively.
- Provider replacement needs adapter and delivery-state mapping work.

## Alternatives rejected

- **Merchant-owned domains:** best brand alignment, too much pilot onboarding.
- **Merchant mailbox OAuth/send-as:** broader scopes, token/support complexity.
- **Raw SMTP:** weaker event, suppression and diagnostic ergonomics.

## Reference

- [Postmark webhook overview](https://postmarkapp.com/developer/webhooks/webhooks-overview)
