# Current State

**Updated:** 2026-08-01

The B2B A/R Collections Assistant requirements, PRD, architecture, data model,
threat model, ADRs, and first UI direction are approved. The official Shopify
React Router TypeScript application is scaffolded, linked to a development app,
and configured for Shopify API `2026-07` with the four approved read scopes.

The old multi-document planning and gate system was retired at the product
owner's direction. `docs/plan.md` is now the single delivery plan:

```text
Requirements gathering → Planning → Development → Testing → Deployment
```

Requirements gathering, planning, development, and the local testing campaign
are complete. Stage 5 deployment is active.

## Built so far

- React Router Shopify application foundation.
- PostgreSQL-backed Prisma session adapter.
- Safe authenticated unsynchronized state and development-only dashboard
  preview.
- Narrow Shopify GraphQL contract documents.
- Basic-store contract observations for B2B companies, contacts, payment terms,
  current/overdue/paid/refunded/cancelled/edited orders, zero outstanding,
  multi-currency behavior, and missing email.
- Expiring offline-token rotation observations.
- Existing local tests, lint, typecheck, Prisma validation, and production build
  were passing at the latest recorded checkpoint.

## Deferred proof

Historical evidence remains under `docs/evidence/f2/` and `memory/` for
reference. Durable external webhook delivery, Plus partial-payment behavior,
negative outstanding, and complete App Pricing runtime states move to the
testing or deployment stage. They are not development blockers. Until proved,
the implementation must use standard-plan behavior and fail closed for
ambiguous capabilities.

## Current development state

D1 — Core platform runtime is complete. It provides:

- A stable `shops` tenant root with lifecycle, pause, scope, sync, and version
  state.
- Tenant-linked encrypted Shopify access and refresh token persistence.
- Shop-scoped repositories and database foreign/unique constraints.
- Install/reactivation, scope-change, uninstall, safe reinstall pause, and
  inactive-shop behavior.
- Append-only audit-event and protected-data-access record foundations.
- Targeted tests for encryption context binding, scope fail-closed behavior,
  shop-domain validation, and authenticated tenant enforcement.
- PostgreSQL-distributed token-rotation locking with optimistic token-version
  compare-and-swap persistence.
- A `pg-boss` queue adapter and `npm run worker` entry point. The current
  typed platform probe job carries only internal IDs, is deduplicated by its
  shop/idempotency key, checks active tenancy before effecting its audit event,
  retries with backoff, and routes terminal failure to a dead-letter queue.
- Structured JSON logs that accept an allowlisted diagnostic shape only, public
  `/healthz` liveness and `/readyz` PostgreSQL readiness endpoints, and
  graceful worker signal handling.

The migration intentionally removes legacy scaffold sessions because their
tokens were stored in plaintext; affected development shops must authenticate
again after applying it.

D2 — Shopify synchronization is complete. It provides:

- A tenant-scoped durable webhook receipt/outbox boundary, payload-size guard,
  receipt deduplication, and typed synchronization work queue.
- Resumable bounded company, location, contact, and order pagination with
  transactional cursor advancement.
- Authoritative targeted order refresh, scheduled full reconciliation, drift
  repair, bounded retry, and authenticated merchant start/retry controls.
- Explicit synchronization lifecycle states and a database guard preventing
  concurrent full-shop synchronization.
- Encrypted buyer email with a keyed lookup digest; unrelated protected
  customer fields are discarded and webhook payloads are neither persisted nor
  logged.
- A repair migration for the polymorphic projection tenant trigger, verified
  against PostgreSQL with successful sync-work and full projection insert
  probes.

Do not resume the old F2 gate; external capability proof remains deferred to
Stage 4 or Stage 5.

D3 — Receivables and aging is complete. It provides:

- A tested, currency-safe aging engine using merchant-local calendar dates and
  current, 1–30, 31–60, 61–90, and 90+ buckets.
- Safe active-aging treatment for partial/refunded Shopify balances and clear
  exclusion/review handling for paid, canceled, zero, negative, and
  missing-schedule records.
- Cached aging projection fields and the tenant/currency/bucket index, updated
  during targeted Shopify order projection.
- A tenant-scoped aging dashboard with per-currency totals, filters, sync
  freshness/error states, review notices, and company/receivable navigation.
- Explicit partial/stale labeling: incomplete Shopify synchronization is never
  presented as a fully reconciled financial view.

D4 — Collections workflow is complete. It provides:

- A tenant-scoped, stable daily collections queue with visible reasons and no
  cross-currency aggregation.
- Audited same-day dismissal and future snooze actions.
- Company and receivable collection history with encrypted internal,
  external-payment, dispute, and snooze notes. External-payment entries are
  explicitly non-authoritative.
- Promise-to-pay creation, supersession, fulfillment, broken, and cancellation
  transitions without changing Shopify payment or balance truth.
- Explainable Shopify-projection payment facts and broken-promise counts that
  are explicitly not a credit score.

D5 — Reminders, statements, and exports is complete. It provides:

- Tenant-scoped reminder policies with immutable versions and stages,
  reply-to verification challenges, exact previews, and explicit approval
  before activation.
- Global pause, per-company suppression, and recipient suppression shared by
  planning and immediate pre-send validation.
- Durable unique delivery reservations and scheduled planning/sending queues.
  Every send rechecks live Shopify order/payment-schedule truth and current
  local safety controls before the provider call.
- At-most-once handling that separates definite provider rejection from
  ambiguous acceptance. Ambiguous attempts become `UNKNOWN` and never enter an
  automatic resend path.
- Authenticated, deduplicated Postmark event ingestion with monotonic delivery
  states and automatic bounce, complaint, and provider suppressions.
- Printable, tenant-authorized company statements with balances partitioned by
  currency, plus aging/collections CSV exports with spreadsheet-formula
  neutralization.
- Targeted D5 rules/export tests, TypeScript validation, targeted lint, Prisma
  validation, and an applied local D5 migration.

Live Postmark domain, delivery, and webhook proof remains deferred to Stage 4
or Stage 5. Provider configuration is optional during development and missing
configuration fails closed.

D6 — Billing, privacy, and operations is complete. It provides:

- A 15-minute Shopify App Pricing entitlement snapshot mapped to Free,
  Starter, Growth, and Scale, with one decision engine shared by UI and worker.
  Reads survive downgrade; stale, frozen, canceled, unmapped, free, or
  over-limit state cannot authorize paid reminder automation.
- A Partner API adapter for the official `activeSubscription` query. Missing
  development credentials use an explicit Free fallback. Live Partner API plan
  combinations and hosted pricing redirects remain Stage 4/5 proof.
- Durable, idempotent customer data, customer redaction, shop redaction, and
  uninstall-cleanup requests. Webhooks persist only stable Shopify subject IDs
  and never log or retain the incoming protected payload.
- Customer protected-data cleanup across contacts, reminder snapshots, notes,
  promises, and display content, plus privacy suppressions and non-reversible
  subject tombstones.
- Tenant purge with a deletion-tombstone ledger that deliberately survives the
  shop foreign-key tree, plus a restore-replay service and hourly retention
  sweep.
- Support-safe diagnostics for synchronization, webhooks, tokens, billing,
  delivery, and privacy; derived alerts; and audited global/per-shop feature
  controls with explicit confirmation.
- A merchant settings/onboarding screen for timezone, setup progress, current
  plan usage, Shopify pricing navigation, diagnostics, retention disclosure,
  and per-shop operational controls.
- Local migration `20260727030000_add_d6_billing_privacy_operations` applied
  successfully. Focused D6 lint, TypeScript, Prisma validation, and 13 targeted
  platform/billing/privacy/reminder tests pass.

## Stage 4 testing result

The local Stage 4 campaign is complete. The final campaign passes 68 Vitest
checks across 19 files, including 11 real-PostgreSQL integration exercises;
three Playwright Chromium flows at 1440×1000 and 390×844; lint; TypeScript;
Prisma validation; all 11 migrations; and the production build.

Stage 4 fixed and locked down:

- runtime-only structured-log field allowlisting;
- concurrent Shopify webhook receipt deduplication;
- rejection of delayed Shopify projection versions;
- separate final-boundary controls for reminder sends and provider webhooks;
- database tenant guards for collection records and same-shop consistency for
  reminder recipients, receivables, stages, and policy versions;
- shop privacy purge when reply-to verification and reminder versions exist;
- customer/shop tombstone replay, queue-adapter restart, dead-letter
  visibility, and active-receivable query-plan coverage;
- patched `brace-expansion` 2.1.4 for the production dependency tree.

The npm audit still reports React Router GHSA-qwww-vcr4-c8h2 because the
installed 7.x packages fall in its version range. The upstream advisory states
that only unstable RSC APIs are affected; this application does not import or
enable them. npm's proposed downgrade to 7.11.0 was not applied.

The Browser plugin was unavailable, so rendered proof used the repository's
installed Playwright 1.61.1 and Chromium. Live Shopify embedded/authenticated
journeys, protected-data and Plus fixtures, App Pricing states, Postmark domain
and webhook delivery, alert routing, and a real isolated backup restore remain
deployment gates. A restored database must fail closed and remain unavailable
until tombstone replay and privacy verification complete.

The next action is Stage 5 deployment. See
`docs/evidence/stage4/2026-08-01-testing.md` for the command and risk record.

## Stage 5 deployment state

The development/staging deployment contract is now repository-ready. It adds a
production-runnable non-root container, a Singapore Render Blueprint for an
isolated web service, worker, and private PostgreSQL database, a US$75/month
staging/pilot ceiling, deployment environment validation, gated migrations,
release-aware smoke checks, an audited global safety-control command, and a
guarded isolated-restore tombstone replay with conflict verification.

The worker runtime defect discovered during deployment preparation is fixed:
`tsx` is now a production dependency and is present in the final image. Web
promotion runs environment preflight plus `prisma migrate deploy`; worker
promotion remains manual and verifies that no migration is pending.

The Stage 5 local campaign passes 71 tests across 20 files, including all 11
PostgreSQL integration checks; lint; TypeScript; Prisma validation; production
build; YAML/Markdown parsing; whitespace checks; and a Docker build from the
pinned Node base digest. Final-image inspection confirms the non-root `node`
user and the web, worker, Prisma, migration, and deployment executables/files.
GitHub Actions initially exposed that the privacy integration file inherited a
tombstone key from the local `.env`; it now owns and restores a synthetic test
key, and the full suite passes with the parent privacy/session keys absent.

No external environment has been created. The reviewed release is published to
the private GitHub repository, but this workspace has no authenticated Render,
Shopify, or Postmark deployment context. Stage 5 therefore remains in progress,
reminder automation remains fail-closed, and pilot traffic is not authorized.
The next action is to provision `render.yaml` from the published release commit
and execute `docs/deployment/staging-runbook.md`, then record live evidence in
`docs/evidence/stage5/2026-08-01-deployment-readiness.md`.
