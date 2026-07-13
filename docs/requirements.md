# Requirements

**Status:** Approved
**Date:** 2026-07-13
**Approved:** 2026-07-14
**Product:** B2B A/R Collections Assistant

## 1. Problem

Small and growing Shopify beauty wholesalers can offer payment terms but still
manage collections through spreadsheets, inbox searches, and memory. They lack
a reliable daily answer to four questions:

1. Who owes money now?
2. Who should be contacted today?
3. What has already been sent or promised?
4. Is it safe to continue extending terms to this buyer?

The product must turn Shopify payment-term orders into an accurate, safe, and
repeatable collections workflow without becoming accounting software.

## 2. Users

### Primary user

An owner, finance administrator, bookkeeper, or operations manager at a Shopify
beauty wholesaler with 10-300 payment-term customers.

### Secondary user

A staff member who reviews customer history, adds notes, records a promise to
pay, or performs approved collection work.

### Customer affected by the product

The merchant's wholesale buyer receives statements and payment reminders. The
buyer does not log into the MVP.

## 3. Product boundaries

### In scope

- Embedded Shopify admin application
- Shopify B2B companies and company locations
- Shopify payment-term orders and authoritative payment state
- Aging calculations and collections prioritization
- Merchant-approved reminder automation
- Statements, notes, promises to pay, delivery history, and CSV exports
- Plan entitlements and Shopify billing
- Privacy, security, audit, recovery, and operational support

### Out of scope

- Payment processing or money movement
- Lending, factoring, financing, legal collection, or credit reporting
- General ledger, bank reconciliation, or accounting-grade adjustments
- QuickBooks, Xero, ERP, CRM, or external payment synchronization
- Customer portal or native mobile application
- Autonomous negotiation or autonomous changes to payment terms
- Custom merchant sending domains
- Broad multi-industry templates during the pilot

## 4. Functional requirements

### FR-1 Installation and access

- The merchant can install the public embedded app using Shopify-managed
  installation.
- The app requests only the minimum GraphQL scopes required for the approved
  workflows.
- The app distinguishes shops and prevents cross-shop data access.
- The app recognizes active, frozen, canceled, and free subscription access.
- An uninstall immediately disables all merchant jobs and reminder sends.

### FR-2 Initial synchronization

- After installation, the merchant can start or automatically enter an initial
  synchronization.
- The app imports the minimum required companies, company locations,
  payment-term orders, payment status, refunds, cancellations, and currencies.
- The merchant can see progress, failures, last successful sync, and whether
  the current dashboard is complete.
- Partial data must never be presented as fully reconciled data.
- The merchant can retry or request a reconciliation after a recoverable error.

### FR-3 Receivables and aging

- The app maintains one receivable projection for each in-scope Shopify order.
- Shopify remains authoritative for order totals and payment state.
- The app calculates due status using Shopify's payment terms and due date.
- Aging buckets are current, 1-30, 31-60, 61-90, and 90+ calendar days overdue.
- Paid and canceled orders leave the active aging totals without losing their
  auditable history.
- Refunds and partial payments update the outstanding balance.
- All money displays include the authoritative currency.
- Totals must not combine different currencies into a false single amount.
- The dashboard shows the data timestamp and reconciliation state.

### FR-4 Aging dashboard

- The dashboard shows total outstanding, overdue total, aging buckets, due
  soon, and recently paid indicators.
- The merchant can filter by company, status, currency, age, amount, and due
  date.
- The merchant can open a company or receivable from the dashboard.
- Empty, syncing, partially synced, failed, and fully reconciled states are
  clearly differentiated.

### FR-5 Daily collections queue

- The app produces a daily list of receivables requiring attention.
- Queue priority considers overdue age, outstanding value, reminder stage,
  promise-to-pay status, and recent collection activity.
- The prioritization explanation is visible to the merchant.
- The merchant can snooze, dismiss for the day, add a note, record a promise,
  or send an approved communication.
- Queue actions are auditable.

### FR-6 Company collection history

- A company view shows outstanding receivables, payment history summary,
  reminders, notes, statements, and promises to pay.
- The merchant can record an external-payment note without changing Shopify's
  authoritative paid or outstanding state.
- External-payment notes are visibly labeled non-authoritative.
- The app calculates a transparent reliability summary using Shopify-recorded
  due and payment dates.
- The summary must not be described as a credit score.

### FR-7 Promise to pay and notes

- Authorized merchant users can add internal notes.
- A promise to pay includes a promised date, optional amount, note, creator,
  and timestamp.
- A promise can be open, fulfilled, broken, canceled, or superseded.
- Promise state may influence queue priority but never modifies Shopify payment
  state.

### FR-8 Reminder policies

- The merchant can configure pre-due and overdue policy stages.
- Each stage defines timing, eligible receivables, template, sender display
  name, reply-to address, and enabled state.
- The merchant must preview and explicitly approve a policy before activation
  during the pilot.
- The app provides a global pause switch and per-company suppression.
- The app rechecks eligibility immediately before every send.
- Paid, canceled, suppressed, disputed, or otherwise ineligible receivables are
  not sent reminders.

### FR-9 Email delivery

- Messages are sent from an app-managed verified domain.
- The merchant's approved address is used as reply-to.
- A unique idempotency key prevents duplicate delivery for a receivable and
  policy stage.
- Accepted, delivered, deferred, bounced, complained, suppressed, and failed
  states are recorded when the provider supports them.
- Hard bounces and complaints suppress unsafe future sends.
- Failed sends use bounded retries and become visible when intervention is
  required.
- The merchant can see exactly what was sent and when.

### FR-10 Statements and exports

- The merchant can generate a branded account statement for one company.
- The statement identifies included receivables, balances, due dates,
  currencies, merchant identity, and generation time.
- Statements can be previewed before sending.
- Aging and collections data can be exported as CSV.

### FR-11 Overdue-order warning

- When technically supported by the approved Shopify extension surface, the
  app warns staff that a company has overdue balances before another order is
  fulfilled or approved.
- The warning is informational in the MVP and does not automatically block
  checkout, fulfillment, or order creation.
- If an appropriate native surface is not available, the warning remains in
  the embedded app and collections queue.

### FR-12 Billing and entitlements

- Shopify App Pricing is the billing authority.
- The free plan supports no more than five active payment-term customers and
  has limited automation.
- Paid plan limits are enforced consistently in the UI and background worker.
- A downgrade never silently deletes merchant data.
- The merchant can see the current plan, limits, and upgrade path.

### FR-13 Privacy and lifecycle

- The app implements all mandatory Shopify privacy webhooks.
- Customer data access and redaction requests are auditable and completed
  within the applicable requirement.
- Shop data is deleted after uninstall according to the documented retention
  policy.
- Reminder content, access tokens, and unnecessary webhook payloads are not
  written to application logs.
- The merchant can access the privacy policy, terms, retention summary, and
  support contact.

### FR-14 Operations and support

- Operators can identify a shop's sync state, queue state, webhook failures,
  token health, and email-provider failures without reading customer message
  content by default.
- Dangerous support actions require explicit confirmation and create audit
  events.
- Reconciliation and safe job replay are supported.
- The app records the deployed version associated with failures.

## 5. Inputs

- Shopify shop, company, company-location, order, payment-term, transaction,
  refund, and cancellation data
- Shopify webhooks and GraphQL reconciliation results
- Merchant reminder policies, notes, promises, suppression choices, branding,
  timezone, and reply-to address
- Shopify subscription state
- Email delivery-provider events

## 6. Outputs

- Aging dashboard and reconciled totals
- Daily collections queue
- Company collection history and reliability summary
- Reminder previews and email messages
- Statements and CSV exports
- Weekly collection summary
- Warnings, sync status, error states, and operator alerts
- Audit and privacy-response records

## 7. Integrations

### Required for MVP

- Shopify GraphQL Admin API
- Shopify webhooks
- Shopify App Bridge and embedded App Home
- Shopify App Pricing and Partner API subscription state
- PostgreSQL
- Durable background job execution
- Transactional email provider and delivery webhooks
- Error tracking, logs, and operational metrics

### Deferred

- Accounting platforms
- Merchant-owned sending domains
- Slack, Teams, CRM, and ERP systems
- Payment links beyond safe links already provided by Shopify

## 8. Non-functional requirements

### Reliability

- Webhooks are durably accepted and acknowledged within Shopify's response
  deadline.
- Duplicate and out-of-order events do not corrupt state or double-send email.
- Scheduled reconciliation repairs missed or failed event processing.
- Background jobs use bounded retries, backoff, and an inspectable terminal
  failure state.
- Reminder delivery is at-most-once from the merchant's perspective for each
  receivable-policy stage.

### Performance

- The embedded dashboard should present useful content or a clear loading state
  promptly and target current Built for Shopify Web Vitals.
- Normal dashboard queries must not require live full-store Shopify scans.
- GraphQL calls respect per-shop cost budgets, pagination, and throttling.
- Large initial imports use bulk operations where appropriate.

### Security

- Session and webhook authenticity are verified.
- Public-app offline tokens expire and rotate securely.
- Secrets and sensitive credentials are encrypted and never exposed to the
  browser.
- Every tenant-owned record and query is scoped to a stable shop identifier.
- Least-privilege access and data minimization are enforced.
- Sensitive administrative actions are auditable.

### Accessibility and usability

- The embedded UI is responsive and follows Shopify interaction patterns.
- Critical workflows are keyboard accessible and meet WCAG 2.1 AA contrast
  expectations.
- Destructive, sending, and automation actions clearly show consequences.
- Sync freshness and errors are understandable without technical knowledge.

### Maintainability

- Domain logic is separated from Shopify, email, billing, and persistence
  adapters.
- Schema migrations, API-version upgrades, and provider changes have documented
  procedures.
- Business rules have unit tests; integration boundaries have contract or
  integration tests; critical workflows have end-to-end tests.

## 9. Constraints

- Public Shopify App Store distribution
- GraphQL Admin API only
- Protected customer and order data may require Shopify approval
- New public apps must support expiring offline tokens
- Shopify API rate limits and webhook delivery behavior
- One builder initially, with self-serve onboarding and support as priorities
- No cold-call-dependent sales process
- Hosting region and monthly infrastructure ceiling are not yet selected

## 10. Acceptance and exit criteria

Requirements were approved for architecture on 2026-07-14. The approval gate
requires that:

- The user approves the product boundary and behaviors in this document.
- Aging behavior for partial payment, refunds, cancellations, edits,
  currencies, and timezones is accepted.
- Pilot automation safety and email identity are accepted.
- Any required change is reflected in the PRD.
- Open architecture questions are explicitly routed to the architecture phase.
