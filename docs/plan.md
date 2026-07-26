# B2B A/R Collections Assistant — Delivery Plan

**Status:** Active
**Updated:** 2026-07-26
**Current stage:** 3. Development

This is the single planning and execution document for the project. It replaces
the previous project plan, task backlog, phased control plan, implementation
plan, and development workflow documents.

The delivery sequence is:

```text
Requirements gathering → Planning → Development → Testing → Deployment
```

Requirements and architecture remain reference documents. Historical Shopify
proof and evidence remain useful, but unfinished external proof does not block
development. When an external capability is unavailable or ambiguous, the
application must use a safe fallback and the limitation moves to the testing or
deployment stage.

## Project rules that remain non-negotiable

- Shopify is the source of truth for balances and payment state.
- Every persisted tenant query and constraint is scoped by shop.
- Webhooks are untrusted, duplicated, delayed, and potentially out of order.
- Ambiguous reminder eligibility or provider submission fails closed.
- Tokens, HMAC values, webhook bodies, buyer email, and protected customer
  payloads are never logged.
- Use the GraphQL Admin API only and retain the approved least-privilege scope
  and field boundary.
- Business rules belong in focused server/domain modules, not route files.
- Do not combine money from different currencies.
- Missing Plus, billing, tunnel, or provider access must not stop development
  of the standard-plan core product.

## Stage 1 — Requirements gathering

**Status:** Complete

The product problem, users, scope, functional requirements, non-functional
requirements, user journeys, pricing hypothesis, and success criteria are
approved.

Reference documents:

- `docs/requirements.md`
- `docs/prd.md`

No further requirements work is needed before development. New discoveries are
handled as small requirement changes without reopening the entire stage.

## Stage 2 — Planning

**Status:** Complete

The modular-monolith architecture, Shopify ownership boundary, data model,
security posture, privacy model, job system, email provider, billing direction,
and deployment direction are approved.

Reference documents:

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/data-model.md`
- `docs/architecture/shopify-integration.md`
- `docs/architecture/threat-model.md`
- `docs/architecture/adrs/`
- `docs/design/`

The development order below is sufficient to build the MVP. Planning should be
updated only when implementation reveals a concrete change.

## Stage 3 — Development

**Status:** Active

The goal of this stage is a feature-complete, production-shaped MVP. Work moves
through the following build slices in order. Each slice should leave the app
runnable. Targeted checks may be used while coding, but broad proof exercises
and the full validation campaign belong to Stage 4.

### D1 — Core platform runtime

**Status:** Active

Build:

- Tenant-aware `shops` persistence and lifecycle state.
- Encrypted expiring offline-session storage and safe token rotation.
- Shop-scoped repository boundaries and database constraints.
- Install, scope-change, uninstall, reinstall, and inactive-shop behavior.
- Audit-event foundation and protected-data-access records.
- `pg-boss` setup, web/worker process entry points, typed jobs, retries,
  dead-letter visibility, and graceful shutdown.
- Structured allowlist logging, health endpoints, and correlation IDs.

Outcome: an installed shop can safely persist state, enqueue durable work, and
disable all work on uninstall.

### D2 — Shopify synchronization

Build:

- Durable webhook intake with HMAC verification, payload limits, receipt
  deduplication, and transactional enqueue.
- Company, location, contact, receivable, payment-schedule, transition, and sync
  cursor persistence.
- Initial company/contact pagination and order import.
- Incremental targeted GraphQL refresh from webhook jobs.
- Reconciliation, cursor recovery, drift repair, and manual retry.
- Explicit syncing, partial, fresh, stale, failed, and reconciled states.
- Encrypted buyer email only; discard unrelated protected fields.

Outcome: PostgreSQL contains a current, repairable, shop-scoped projection of
Shopify B2B receivables.

### D3 — Receivables and aging

Build:

- Currency-safe aging engine with current, 1–30, 31–60, 61–90, and 90+ buckets.
- Correct handling for paid, cancelled, refunded, partial, edited, zero,
  negative, missing-schedule, and multi-currency states.
- Tenant-scoped dashboard queries and indexes.
- Real aging dashboard with totals partitioned by currency.
- Filters, company/receivable navigation, freshness, sync, empty, and error
  states.

Outcome: merchants can see a trustworthy aging dashboard backed by synchronized
Shopify data.

### D4 — Collections workflow

Build:

- Explainable daily priority queue with stable ordering.
- Snooze, daily dismissal, and audited collection actions.
- Company collection history and receivable timeline.
- Internal notes and explicitly non-authoritative external-payment notes.
- Promise-to-pay lifecycle: open, fulfilled, broken, cancelled, superseded.
- Explainable reliability facts without producing a credit score.

Outcome: staff can work collections without spreadsheets while Shopify remains
the payment authority.

### D5 — Reminders, statements, and exports

Build:

- Reminder policy drafts, immutable versions, stages, preview, approval,
  activation, pause, and company suppression.
- Reply-to verification and recipient suppression.
- Eligibility snapshots and an immediate Shopify recheck before sending.
- Unique delivery reservation and at-most-once provider submission.
- Safe handling for definite failure and ambiguous `UNKNOWN` submission.
- Delivery-event ingestion for accepted, delivered, deferred, bounced,
  complained, suppressed, and failed states.
- Branded statements and currency-safe CSV exports with formula neutralization.

Outcome: merchants can safely communicate with buyers and produce useful
collection outputs.

### D6 — Billing, privacy, and operations

Build:

- Shopify App Pricing subscription mapping and entitlement snapshots.
- Free and paid limits shared by UI and worker.
- Customer data request, customer redaction, shop redaction, uninstall cleanup,
  retention, and deletion tombstones.
- Support-safe diagnostics for sync, queues, webhooks, tokens, billing, and
  email.
- Global and per-shop safety controls, alerts, and audited support actions.
- Pilot onboarding and settings needed to operate the complete MVP.

Outcome: the feature-complete app can be operated, billed, supported, and
cleaned up safely.

## Stage 4 — Testing

**Status:** Not started

Testing begins after the development slices are feature complete. Fixes found
here return directly to the affected module without reopening planning.

### Automated validation

- Unit tests for business rules, aging, eligibility, transitions, and
  entitlements.
- PostgreSQL integration tests for tenant isolation, constraints, lifecycle,
  jobs, idempotency, and concurrency.
- Shopify contract tests for GraphQL selections and webhook handling.
- End-to-end browser tests for onboarding, dashboard, queue, notes, promises,
  policies, statements, billing, and privacy flows.
- Full project checks:

```powershell
npm test
npm run lint
npm run typecheck
npm run prisma:validate
npm run build
```

### Quality validation

- Responsive and accessibility review.
- Security and privacy review.
- Performance and query-plan review.
- Duplicate, delayed, missing, and out-of-order webhook scenarios.
- Worker restart, dead-letter, retry, backup, restore, and rollback exercises.
- Reminder race, suppression, paid-before-send, and ambiguous-provider cases.
- Standard-plan behavior and available Plus compatibility.
- Shopify App Pricing states available to the organization.

Exit: no critical correctness, security, privacy, tenant-isolation, or
duplicate-send defects remain.

## Stage 5 — Deployment

**Status:** Not started

### Development and staging deployment

- Select the Render region and budget.
- Provision isolated web, worker, PostgreSQL, secrets, storage, Postmark stream,
  monitoring, and alerts.
- Run migrations as a gated release step.
- Deploy an immutable image and perform smoke checks.
- Configure a durable public webhook endpoint.

### Controlled pilot

- Connect three to five synthetic or approved pilot stores.
- Start with manual reminder approval and conservative sending.
- Monitor sync correctness, queue usefulness, send safety, collection outcomes,
  support load, and merchant feedback.
- Fix release defects and repeat the deployment checks.

### Public release

- Complete protected-customer-data and `read_all_orders` approval.
- Publish privacy policy, terms, retention information, and support process.
- Complete App Store listing, onboarding, pricing, demo data, and reviewer
  instructions.
- Perform staged rollout with monitoring, pause, rollback, and incident
  procedures.
- Begin the 90-day market-validation measurement period.

Exit: the public app is deployed, observable, supportable, and safely
rollbackable.

## Current position and immediate action

Stages 1 and 2 are complete. The Shopify app scaffold and much of the platform
contract exploration already exist. Historical F2 evidence is retained under
`docs/evidence/f2/`, but its remaining external items are deferred to Stage 4
or Stage 5 and do not block development.

The immediate action is **D1 — Core platform runtime**, beginning with the
tenant-aware Prisma schema, shop lifecycle model, and shop-scoped repository
boundary.
