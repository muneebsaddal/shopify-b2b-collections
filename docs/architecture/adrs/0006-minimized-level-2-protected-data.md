# ADR 0006: Minimize Level-2 protected data to buyer email

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

Direct buyer reminders are the MVP wedge and require an email address. Shopify
classifies name, address, phone and email as Level-2 protected fields. Broader
customer access increases review, breach and compliance risk.

## Decision

Request protected customer data and the email field only. Use `read_customers`
for Company/CompanyLocation and the linked Customer's default email; do not
request or fetch name, address or phone. Encrypt email at application level and
store a keyed HMAC for exact matching/suppression. Implement all Shopify Level-1
and Level-2 safeguards before pilot data.

If email access is missing/redacted, the app shows receivables but disables
email action. It does not fall back to another unapproved field.

## Consequences

- The product retains its reminder value while materially reducing data scope.
- Protected-data review and strong operational controls are still required.
- Templates cannot personalize by contact name in the MVP.
- Customer/shop redaction and backup deletion semantics are critical paths.

## Alternatives rejected

- **No protected fields:** safer but cannot deliver the core reminder workflow.
- **Email plus name/address/phone:** unnecessary for MVP and harder to justify.

## Reference

- [Shopify protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
