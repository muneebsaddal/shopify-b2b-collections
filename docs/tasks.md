# MVP Implementation Tasks

**Status:** Approved implementation backlog
**Created:** 2026-07-15

Tasks are ordered by dependency. Each task must satisfy the per-task gate in
`DEVELOPMENT_WORKFLOW.md`: linked acceptance criteria, tests, documentation,
review, and no unresolved critical security or data-integrity issue.

## F - Platform foundation

### F1 - Scaffold and validate the application foundation (complete)

- [x] Base the repository on Shopify's official React Router TypeScript app.
- [x] Configure PostgreSQL-backed Prisma session storage and API `2026-07`.
- [x] Add environment validation, local commands, tests, linting, type checking,
  build validation, and a single-package CI workflow.
- [x] Replace the template demo with the first responsive collections-dashboard
  slice and keep a no-auth preview route for visual QA.
- [x] Document account-dependent linking and local setup.

Acceptance: a clean checkout can install dependencies and pass test, lint,
typecheck, Prisma validation, and production build without Shopify credentials.

### F2 - Link Shopify app and prove the platform contract

- [ ] Create or select the Dev Dashboard organization and app record.
- [ ] Link `shopify.app.toml` and install on a B2B-capable development store.
- [ ] Obtain and verify the four approved read scopes and email-only protected
  customer data path.
- [ ] Execute and save narrow GraphQL contract queries for companies, company
  locations, contacts, orders, payment terms, schedules, refunds, cancellations,
  and partial payments.
- [ ] Validate supported webhook topics, expiring offline-token rotation, API
  costs, standard-plan behavior, and Plus-only compatibility fixtures.

Acceptance: every item in the development-store proof checklist is evidenced or
recorded as a named blocker; no unapproved data field or write scope is used.

### F3 - Establish tenant and lifecycle persistence

- [ ] Implement `shops`, encrypted/rotating session material, shop membership,
  audit-event, privacy-request, and protected-data-access records.
- [ ] Enforce shop-scoped unique constraints and repository interfaces.
- [ ] Make install, scope change, uninstall, reinstall, and tombstoned-shop
  behavior idempotent.

Acceptance: cross-tenant, duplicate install, token rotation, and uninstall
integration tests pass against PostgreSQL.

### F4 - Establish durable job processing and observability

- [ ] Configure `pg-boss`, web/worker process entry points, job envelopes,
  retries, dead-letter handling, and correlation IDs.
- [ ] Add structured redacted logs, health checks, metrics seams, and error
  reporting interfaces.
- [ ] Prove enqueue-in-transaction behavior and graceful shutdown.

Acceptance: jobs survive process restart, duplicate enqueue is safe, and logs
contain correlation metadata without secrets or protected payloads.

## S - Shopify synchronization

### S1 - Durable webhook intake

- [ ] Implement raw-body HMAC verification, payload limits, normalized shop
  lookup, receipt deduplication, and transactional enqueue.
- [ ] Register lifecycle, order/payment, and B2B identity topics from the
  approved integration contract.

Acceptance: invalid HMAC is rejected; duplicate and out-of-order fixtures are
safe; durable acceptance returns quickly.

### S2 - Initial company and receivable import

- [ ] Implement company/contact paging and order bulk-operation import.
- [ ] Persist progress, errors, throttle state, cursors, and completeness state.
- [ ] Keep different currencies partitioned and protected fields minimized.

Acceptance: empty, partial, resumed, failed, and complete imports are tested and
partial data is never labeled reconciled.

### S3 - Incremental projection refresh

- [ ] Refresh affected Shopify records from webhook jobs rather than trusting
  webhook payloads as the ledger.
- [ ] Implement idempotent state transitions for paid, partially paid, refunded,
  edited, cancelled, and reopened scenarios.

Acceptance: projection fixtures match authoritative Shopify responses and stale
events cannot regress newer state.

### S4 - Reconciliation and repair

- [ ] Add scheduled drift detection, targeted repair, manual retry, cursor
  recovery, and affected-send fail-closed behavior.

Acceptance: a deliberately missed webhook is repaired and audit evidence shows
the mismatch and resolution.

## R - Receivables experience

### R1 - Currency-safe aging engine

- [ ] Calculate current, 1-30, 31-60, 61-90, and 90+ buckets from authoritative
  due dates and calendar-day lateness.
- [ ] Exclude paid/cancelled balances and update refunds/partial payments.

Acceptance: boundary dates, time zones, negative/zero balances, multiple
currencies, refunds, and partial payments have deterministic tests.

### R2 - Trusted aging dashboard

- [ ] Connect the dashboard design to real tenant-scoped data.
- [ ] Implement currency partitions, filters, navigation, sync timestamps, and
  empty/syncing/partial/failed/reconciled states.

Acceptance: PRD Story 1 and requirements FR-3/FR-4 pass integration and browser
tests at desktop and mobile widths.

### R3 - Daily collections queue

- [ ] Implement explainable priority scoring, stable ordering, snooze, dismiss,
  notes, promise context, and audit events.

Acceptance: every priority reason is explainable, deterministic, tenant scoped,
and satisfies PRD Story 2 / FR-5.

### R4 - Company collections history

- [ ] Show receivables, payments, reminders, statements, notes, promises, and a
  transparent reliability summary that is never labeled a credit score.

Acceptance: protected-data redaction and external-payment-note behavior satisfy
FR-6 without changing Shopify truth.

### R5 - Notes and promises to pay

- [ ] Implement note creation and promise lifecycle: open, fulfilled, broken,
  cancelled, and superseded.

Acceptance: authorization, auditability, transitions, and queue influence are
covered without modifying Shopify payment state.

## M - Reminder automation

### M1 - Policy authoring and immutable versions

- [ ] Build recommended beauty-wholesale stages, editing, preview, explicit
  approval, version activation, pause, and per-company suppression.

Acceptance: an unapproved or superseded policy version cannot send.

### M2 - Reply-to verification and recipient suppression

- [ ] Prove Postmark sending domain, verify merchant reply-to addresses, ingest
  bounce/complaint/unsubscribe events, and enforce suppression.

Acceptance: unverified/suppressed recipients are fail-closed with an auditable
reason and no protected address is leaked into logs.

### M3 - Idempotent reminder delivery

- [ ] Implement eligibility snapshot, immediate pre-send recheck, deterministic
  idempotency key, provider submission, ambiguous-send state, and safe retry.

Acceptance: paid, cancelled, disputed, suppressed, paused, stale, duplicate, and
ambiguous cases never double-send.

### M4 - Statements and CSV export

- [ ] Generate currency-safe statements and exports with access checks, audit
  events, retention, and safe formula escaping.

Acceptance: FR-10 output is correct, tenant scoped, and protected against CSV
formula injection.

## B - Billing and entitlements

### B1 - Shopify App Pricing integration

- [ ] Map canonical Partner API subscription states to entitlements and cache
  snapshots with safe degradation.
- [ ] Verify free, test, active, frozen, cancelled, monthly, and annual states.

Acceptance: plan limits fail predictably and billing uncertainty cannot cause
unsafe reminder sends or destructive data changes.

## P - Privacy, operations, and pilot

### P1 - Privacy webhooks and retention

- [ ] Implement customer data request/redaction, shop redaction, uninstall
  cleanup, retention sweeps, deletion evidence, and restore semantics.

Acceptance: mandatory privacy and reinstall flows pass end-to-end tests.

### P2 - Support diagnostics and safety controls

- [ ] Add sync lag, queue lag, webhook failures, reconciliation health, email
  failure, global pause, per-shop pause, and support-safe diagnostics.

Acceptance: operators can diagnose a pilot incident without database access or
exposure of protected payloads.

### P3 - Pilot readiness

- [ ] Seed all required payment scenarios, complete load/recovery/security tests,
  choose Render region/budget, configure backups/restore, monitoring, runbooks,
  Postmark domain, and Shopify private test plan.

Acceptance: every pilot gate in `DEVELOPMENT_WORKFLOW.md` is checked with
evidence and a rollback rehearsal succeeds.

### P4 - Public App Store readiness

- [ ] Complete protected-data approval, listing assets, legal/support material,
  performance/accessibility review, staged rollout, and incident rollback.

Acceptance: every public-release gate is checked before submission.
