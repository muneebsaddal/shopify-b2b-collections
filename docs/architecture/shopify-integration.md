# Shopify Integration Contract

**Status:** Documentation-verified; development-store proof pending
**Verified against:** Shopify API `2026-07` on 2026-07-14

## 1. Platform baseline

- Scaffold with Shopify's official React Router TypeScript template, the
  recommended path for most new apps.
- Build a public embedded App Home application using session-token
  authentication.
- Use GraphQL Admin API only. Pin `2026-07`; review release candidates before
  each quarter and upgrade at least quarterly.
- Use app-specific webhook subscriptions in `shopify.app.toml` where supported.
- Use expiring offline access tokens. Public apps created on or after 2026-04-01
  must use them; the official library should perform refresh, while the app
  encrypts and atomically persists rotated token material.
- Use Shopify App Pricing and query the Partner API for canonical subscription
  state. Do not build legacy Billing API charges.

## 2. Requested access

### Shopify plan capabilities

Current Shopify guidance makes core B2B companies, company locations, and net
payment terms available on Basic, Grow, Advanced, and Plus. Deposit requirements
and advanced partial-payment capabilities remain Plus-only. The MVP must not
require a Plus-only feature to install or deliver its core aging and reminder
workflow. Capability checks and fixtures must cover a standard-plan core B2B
store; Plus-only partial-payment scenarios are an additional compatibility path.

### Admin API scopes

| Scope | Why it is required | Review note |
|---|---|---|
| `read_orders` | Order, balances, currency, purchasing entity, transactions, refunds and status | Protected Level 1 order data |
| `read_all_orders` | Open net-term receivables can be older than Shopify's default 60-day order window | Separate approval; pair with `read_orders` |
| `read_payment_terms` | Payment terms and schedules, authoritative due/balance fields | Read-only |
| `read_customers` | Company/location objects and the linked customer's default email for reminders | Requires protected-data review |

No write scope is planned for the MVP. `read_companies` is unnecessary because
`read_customers` grants reads of Company and CompanyLocation and is already
needed for the contact's customer email. Do not add fulfillment, draft-order,
marketing, payment, product, address, phone or name access.

### Protected customer data request

Request:

- Level 1 protected customer/order data needed for companies and receivables;
- Level 2 **email only** to deliver merchant-authorized transactional reminders.

Do not request protected name, address or phone fields. The application must
still work safely when protected fields are redacted or missing: the receivable
remains visible, but email actions are disabled with a clear reason.

## 3. GraphQL read model

The exact selection sets must be kept as persisted source files and contract
tested. The minimum field intent is:

### Shop/installation

- stable shop identity, shop domain and IANA timezone;
- current granted scopes through the supported auth/library path.

### Companies and contacts

- `Company`: `id`, `name`, source timestamps when available;
- `CompanyLocation`: `id`, `name`, parent company;
- `CompanyContact`: `id`, parent company and related `Customer.id`;
- `Customer`: `id`, `defaultEmailAddress.emailAddress` only.

Do not fetch customer display name, first/last name, phone, addresses, notes,
marketing status, order history or metafields.

### Orders and receivables

- `Order.id`, `name`, `createdAt`, `updatedAt`, cancellation/closed/payment
  status, `unpaid`, `currencyCode`/MoneyBag values;
- `purchasingEntity` and its `PurchasingCompany` company/location/contact links;
- `paymentTerms` and schedules;
- `totalPriceSet`, `totalOutstandingSet`, `totalReceivedSet`,
  `totalRefundedSet` as required to explain state;
- transaction/refund identifiers and safe state fields only when required for
  reconciliation.

`Order.totalOutstandingSet` is the authoritative remaining order balance. A
positive value favors the merchant; a negative value favors the customer.

### Payment schedules

Use `PaymentSchedule.id`, `balanceDue`, `totalBalance`, `due`, `dueAt`,
`issuedAt` and `completedAt`. The older `amount` field is deprecated and must
not be used.

## 4. Query strategy and rate limits

- Filter initial import to payment-term/B2B-relevant orders where Shopify query
  capabilities permit; discard irrelevant records immediately.
- Use GraphQL bulk operations for large initial order datasets; use ordinary
  cursor pagination for bounded company/contact reads and repair queries.
- Read `extensions.cost.throttleStatus` from every Admin API response.
- Budget per shop with bounded concurrency and jittered backoff. The standard
  GraphQL Admin limit is cost-based and currently restores 100 points/second;
  Shopify can reduce limits temporarily.
- A single query must remain under Shopify's maximum query cost. Selection sets
  should be narrow and page sizes tuned from observed cost.
- Treat GraphQL HTTP 200 responses with an `errors` array as partial/failure
  according to field criticality, especially for unapproved protected fields.

## 5. Webhook topics

Subscribe only to topics that drive the projection or lifecycle:

### Orders and payment

- `orders/create`
- `orders/updated`
- `orders/paid`
- `orders/cancelled`
- `refunds/create`
- `order_transactions/create`
- `payment_schedules/due`
- `payment_terms/create`
- `payment_terms/update`
- `payment_terms/delete`

### B2B identity

- `companies/create`, `companies/update`, `companies/delete`
- `company_locations/create`, `company_locations/update`,
  `company_locations/delete`
- `company_contacts/create`, `company_contacts/update`,
  `company_contacts/delete`

### App lifecycle

- `app/uninstalled`
- `app/scopes_update`

### Mandatory compliance

- `customers/data_request`
- `customers/redact`
- `shop/redact`

After scaffold, validate each topic and required scope using the `2026-07`
webhook reference and generated app configuration. Use `include_fields` to
reduce payloads where the subscription form supports it.

## 6. Webhook processing contract

1. Read the raw request body and verify Shopify HMAC before parsing or side
   effects.
2. Validate topic, shop domain and payload size. Map the shop using the
   normalized domain; do not trust payload tenant identifiers for authorization.
3. Insert a receipt keyed by `X-Shopify-Webhook-Id` and enqueue processing in
   the same PostgreSQL transaction.
4. Return 2xx quickly after durable acceptance. Duplicate receipts also return
   2xx.
5. The worker processes idempotently and usually performs a targeted GraphQL
   refresh rather than trusting the webhook as a complete record.
6. Use Shopify source timestamps/current state because ordering is not
   guaranteed.
7. Reconciliation repairs missed deliveries. Never make webhook delivery the
   only path to correctness.

Capture `X-Shopify-Event-Id`, triggered time, API version and correlation-safe
headers for diagnostics. Never log webhook bodies or HMAC secrets.

## 7. Installation and token lifecycle

1. Shopify-managed installation completes OAuth and grants the exact requested
   scopes.
2. Persist the shop and envelope-encrypted access/refresh token plus expiry in a
   transaction.
3. Verify granted scopes before initial sync; missing critical scopes make the
   app visibly incomplete and block automation.
4. Refresh before access-token expiry using a distributed lock and compare-and-
   swap token version so concurrent workers cannot overwrite a newer rotation.
5. On `app/scopes_update`, refresh granted-scope state and disable affected
   features until reconciled.
6. On `app/uninstalled`, atomically mark the shop inactive and globally paused;
   all worker commands check active status. Do not depend on token revocation
   timing for safety.

## 8. Billing and entitlements

- Configure Free, Starter, Growth and Scale as Shopify App Pricing plans.
- Shopify hosts selection and performs recurring/annual billing, trials,
  proration and changes.
- As of the 2026-07-14 review, the Partner API documentation labels the
  `activeSubscription` query's `2026-07` surface as release candidate. Verify
  stable availability and permissions when implementing billing; if it is not
  stable, use Shopify's then-supported App Pricing verification path rather than
  silently falling back to legacy Billing API charges.
- On redirect, use `plan_handle` and shop only as lookup inputs, then query the
  Partner API to verify canonical active subscription state.
- For lifecycle changes without a redirect, poll/refresh the Partner API and use
  the supported app billing events/history APIs; do not depend on the legacy
  subscription webhook removed from the current flow.
- Cache a short-lived entitlement snapshot. UI and worker call the same domain
  entitlement service. A stale snapshot may retain existing read access briefly
  but cannot authorize a new paid-only automation change.
- Use Shopify's $0 private test plan in development.

## 9. Privacy lifecycle

Mandatory privacy handlers verify HMAC, acknowledge valid requests, create an
audited idempotent privacy job and complete required work within Shopify's
deadline. `shop/redact` is the final tenant purge signal after uninstall; the
app also disables all work immediately on uninstall.

Customer redaction removes buyer email, note/message content attributable to
the subject where required, generated files and access paths. Keep only
permitted non-personal request completion evidence. A data request returns only
data the app actually holds and routes it securely to the merchant-defined
process; it is never emailed blindly from a webhook payload.

## 10. Development-store proof checklist

- [ ] Create a Shopify Plus/B2B-capable development store with companies,
  locations, contacts and payment-term orders, plus a standard-plan B2B fixture
  or documented capability-equivalent test.
- [ ] Obtain `read_all_orders` and protected customer data/email access in the
  development app configuration.
- [ ] Capture successful GraphQL queries for partial payment, refund,
  cancellation, edit, paid and overdue schedules.
- [ ] Confirm negative/zero outstanding balance behavior and multi-currency
  MoneyBag selection.
- [ ] Verify every webhook topic in `shopify.app.toml` and replay duplicates and
  reversed order.
- [ ] Verify expiring offline-token refresh and concurrent rotation.
- [ ] Verify Partner API state for free, test, active, frozen, canceled and
  downgraded plans.
- [ ] Record query costs and set initial page/concurrency budgets.

## 11. Official references

- [React Router app scaffold](https://shopify.dev/docs/apps/build/scaffold-app)
- [Admin API access scopes](https://shopify.dev/docs/api/usage/access-scopes)
- [Order query and 60-day limitation](https://shopify.dev/docs/api/admin-graphql/latest/queries/order)
- [Company object scopes](https://shopify.dev/docs/api/admin-graphql/latest/objects/company)
- [Customer object and default email](https://shopify.dev/docs/api/admin-graphql/latest/objects/customer)
- [PaymentSchedule fields](https://shopify.dev/docs/api/admin-graphql/latest/objects/PaymentSchedule)
- [GraphQL API limits](https://shopify.dev/docs/api/usage/limits)
- [Webhook reference](https://shopify.dev/docs/api/webhooks/2026-07)
- [Webhook subscription configuration](https://shopify.dev/docs/apps/build/webhooks/subscribe)
- [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [Expiring offline tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens)
- [Shopify App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing)
- [Partner API active subscription](https://shopify.dev/docs/api/partner/latest/active-subscription)
- [Shopify B2B features by plan](https://help.shopify.com/en/manual/b2b/getting-started/plan-features)
