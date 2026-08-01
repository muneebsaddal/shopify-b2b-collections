# B2B A/R Collections Assistant — Delivery Plan

**Status:** Active
**Updated:** 2026-08-01
**Current stage:** 5. Deployment

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

**Status:** Complete

The goal of this stage is a feature-complete, production-shaped MVP. Work moves
through the following build slices in order. Each slice should leave the app
runnable. Targeted checks may be used while coding, but broad proof exercises
and the full validation campaign belong to Stage 4.

### D1 — Core platform runtime

**Status:** Complete

Implemented:

- Tenant-root `shops` persistence with lifecycle, pause, scope-completeness,
  sync-state, optimistic-version, and stable internal identity fields.
- Tenant-linked Shopify sessions with application-level AES-256-GCM encryption
  for access and refresh tokens, scope fingerprints, token versions, and no
  persisted Shopify user name, email, or locale.
- Shop-scoped repository boundaries plus append-only audit-event and
  protected-data-access foundations.
- Install/reactivation, scope-change, uninstall, reinstall-safe pause, session
  removal, and inactive-shop application-shell behavior.

Next within D1:

- Distributed PostgreSQL row locking and compare-and-swap rotation service for
  expiring offline tokens.
- `pg-boss` adapter with a typed, idempotent platform probe job, bounded
  retries, dead-letter queue visibility, dedicated worker entry point, and
  graceful `SIGINT`/`SIGTERM` shutdown.
- Structured allowlist logging, correlation-aware worker records, and public
  liveness/readiness endpoints at `/healthz` and `/readyz`.

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

**Status:** Complete

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

Implemented with resumable tenant-scoped cursors, bounded company, location,
contact, and order pagination, authoritative targeted order refreshes, and a
scheduled reconciliation sweep. A completed sweep repairs projection drift
before marking the shop fresh. Failed work remains retryable from the merchant
dashboard, and a partial unique database guard prevents concurrent full-shop
synchronizations. Only buyer email is retained from protected contact data,
encrypted at rest with a keyed lookup digest; unrelated customer fields are
discarded.

### D3 — Receivables and aging

**Status:** Complete

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

Implemented with an explicit projection-safety boundary: totals are always
partitioned by currency, calendar-day age uses the merchant timezone, and
missing payment schedules, zero balances, negative balances, stale/partial
sync, and failed sync are visible rather than silently treated as normal aging.
The dashboard is backed by tenant-scoped PostgreSQL queries, supports company,
currency, age, amount, and due-date filters, and provides safe company and
receivable navigation. It safely labels partial or stale D2 projection state
and never calls it reconciled until a complete drift-repair sweep succeeds.

### D4 — Collections workflow

**Status:** Complete

Build:

- Explainable daily priority queue with stable ordering.
- Snooze, daily dismissal, and audited collection actions.
- Company collection history and receivable timeline.
- Internal notes and explicitly non-authoritative external-payment notes.
- Promise-to-pay lifecycle: open, fulfilled, broken, cancelled, superseded.
- Explainable reliability facts without producing a credit score.

Outcome: staff can work collections without spreadsheets while Shopify remains
the payment authority.

Implemented with a tenant-scoped, computed daily queue whose documented stable
ordering is overdue promise, overdue age, item-local outstanding amount, due
date, then ID. Dismissals and snoozes are app-owned, append-audited actions.
Company and receivable views now expose a collection timeline, encrypted
internal/external-payment notes, promise-to-pay lifecycle transitions, and
explainable payment reliability facts without a credit score or payment-state
mutation.

### D5 — Reminders, statements, and exports

**Status:** Complete

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

Implemented with tenant-scoped immutable policy versions, explicit preview and
approval, verified reply-to challenges, global/company/recipient suppression,
and PostgreSQL-backed delivery reservations. The worker plans due stages,
revalidates current Shopify order, payment-schedule, balance, currency, pause,
dispute, and suppression state immediately before submission, and fails closed
on ambiguity. Definite provider rejection uses bounded retry; any submission
whose acceptance is ambiguous becomes `UNKNOWN` and cannot be automatically
resent. Authenticated, deduplicated provider events advance delivery state
monotonically and hard bounce, complaint, and provider suppression events
create local recipient suppressions. Merchant routes expose delivery history,
printable branded multi-currency statements, and UTF-8 CSV exports containing
aging plus safe collection-workflow facts with spreadsheet-formula
neutralization.

Real Postmark sending-domain, reply-to delivery, and provider-webhook proof
remain Stage 4/5 external validation. Missing provider configuration fails
closed and does not block development.

### D6 — Billing, privacy, and operations

**Status:** Complete

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

Implemented with one tenant-scoped entitlement service shared by merchant
actions and workers. It maps Shopify App Pricing Partner API subscription
items to Free, Starter, Growth, and Scale limits, caches 15-minute snapshots,
retains read access after downgrade, and denies new or scheduled paid
automation whenever billing truth is stale, frozen, canceled, unmapped, or
over the active-customer limit. Missing Partner API configuration uses an
explicit Free development fallback and cannot unlock paid automation.

The mandatory privacy webhooks now retain only stable subject IDs, create
idempotent tenant-scoped requests, and enqueue bounded privacy work without
logging protected payloads. Customer redaction removes encrypted contact,
message, note, promise, and related display content, adds a privacy
suppression, and records a non-reversible subject tombstone. Shop redaction and
the uninstall retention schedule purge the tenant while preserving a global
deletion tombstone outside the tenant foreign-key tree for restore replay.
Hourly retention work removes processed webhook metadata after seven days and
expires protected delivery/access metadata on the documented one-year policy.

The settings and operations surface provides pilot onboarding, timezone
configuration, plan usage and upgrade routing, safe health counts, derived
alerts, and explicit per-shop controls. Global and per-shop controls cover
Shopify imports, reminder sends, statements, billing changes, and provider
webhooks. Dangerous support-control changes require literal confirmation and
append tenant audit events; diagnostics never expose tokens, buyer email, HMAC
values, webhook bodies, or message content.

Live Partner API plan states, hosted pricing redirects, Shopify privacy
delivery evidence, alert routing, and backup-restore tombstone replay remain
Stage 4/5 external validation.

## Stage 4 — Testing

**Status:** Complete locally; external environment proof is deployment-gated

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

### Stage 4 result — 2026-08-01

- The complete local campaign passes: 68 Vitest unit, contract, and PostgreSQL
  integration checks across 19 files; lint; TypeScript; Prisma generation and
  validation; all 11 migrations; and the production build.
- Three Playwright checks pass on Chromium for the desktop preview, mobile
  preview, and honest unsynchronized state. They cover page identity,
  meaningful content, framework-overlay and console health, responsive
  containment, accessible control names, keyboard activation, filter state,
  and automation-pause state.
- PostgreSQL proof covers cross-shop reference rejection, same-shop reminder
  relationship integrity, concurrent webhook deduplication, delayed/out-of-
  order projection rejection, concurrent delivery reservation, independent
  reminder/provider safety switches, customer and shop deletion-tombstone
  replay, queue-adapter restart, dead-letter visibility, and receivable index
  selection.
- Stage 4 fixes hardened runtime log allowlisting, webhook race recovery,
  Shopify source-version ordering, reminder safety controls, D4 tenant
  constraints, D5 delivery relationships, and privacy shop-purge cascades.
- The production `brace-expansion` denial-of-service advisory is remediated by
  pinning patched `2.1.4`. The remaining npm advisory applies only to React
  Router's unstable RSC APIs, which this application does not import or enable;
  npm offers no patched React Router 7 release and its proposed forced downgrade
  is not an appropriate remediation.

Live Shopify embedded authentication, protected-data delivery, Standard/Plus
fixtures, App Pricing states, hosted pricing redirects, real Postmark delivery
and webhook ingress, alert routing, and an infrastructure-level backup restore
remain Stage 5 deployment gates. Until isolated restore proof is complete, a
restored database must not serve traffic before tombstone replay and privacy
verification. The full record is
`docs/evidence/stage4/2026-08-01-testing.md`.

## Stage 5 — Deployment

**Status:** In progress — staging deployment contract ready; live gates open

### Development and staging deployment

- Select the Render region and budget.
- Provision isolated web, worker, PostgreSQL, secrets, storage, Postmark stream,
  monitoring, and alerts.
- Run migrations as a gated release step.
- Deploy an immutable image and perform smoke checks.
- Configure a durable public webhook endpoint.

Repository preparation completed on 2026-08-01:

- Selected Singapore for staging and a US$75/month staging/pilot ceiling,
  subject to the Render checkout estimate before resource creation.
- Added a production-runnable non-root container, isolated Render web/worker/
  PostgreSQL Blueprint, no-secret environment preflight, gated migrations,
  release-aware smoke checks, and manual worker promotion after schema proof.
- Pinned the Node base image by digest and locally proved the pruned production
  image as the non-root `node` user with web, worker, Prisma, migrations, and
  deployment scripts present.
- Added audited global pause/rollback tooling and an isolated restore command
  that replays deletion tombstones and verifies zero remaining conflicts.
- Added `docs/deployment/staging-runbook.md` and the truthful readiness record
  at `docs/evidence/stage5/2026-08-01-deployment-readiness.md`.

No live infrastructure was created from this workspace. The release repository
is connected, but there is no authenticated Render/Shopify/Postmark deployment
context. Provision
IDs, live smoke checks, alert routing, authenticated Shopify/Postmark evidence,
and infrastructure restore/rollback proof remain required before pilot traffic.

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

Development slices D1–D6 and the local Stage 4 campaign are complete. Stage 5
repository preparation is complete, and the reviewed release is published to
the private GitHub repository. The immediate action is to connect that release
commit to Render, provision the isolated staging Blueprint, and follow
`docs/deployment/staging-runbook.md`. Pilot and public-release work remain
blocked until the recorded Shopify, Postmark, billing, alerting,
authenticated-browser, backup-restore, and rollback gates have live evidence.
