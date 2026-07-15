# System Architecture

**Status:** Approved
**Date:** 2026-07-14
**Approved:** 2026-07-15
**Product:** B2B A/R Collections Assistant
**Architecture style:** Modular monolith with a separately runnable worker

## 1. Decision summary

Build one TypeScript codebase from Shopify's official React Router template and
run it as two processes: an embedded web application and a background worker.
Use PostgreSQL for application state and `pg-boss` for durable jobs. Treat
Shopify as authoritative for receivable and payment facts; maintain a local,
reconcilable projection for fast collections workflows. Use Postmark for email
from an app-managed verified domain and Shopify App Pricing for entitlements.
Deploy the pilot as containers on Render with a managed PostgreSQL database.

This is a deliberately boring architecture. It gives one builder simple local
development and operations while retaining hard boundaries around Shopify,
email, billing, jobs, and storage.

## 2. Architecture drivers

The design is optimized for these requirements, in order:

1. Never knowingly send a duplicate or inappropriate payment reminder.
2. Present balances and aging honestly, including freshness and currency.
3. Recover from duplicated, delayed, missed, and out-of-order Shopify events.
4. Prevent cross-shop access and minimize protected customer data.
5. Reach a paid pilot quickly without infrastructure that needs a platform
   team.
6. Keep provider choices replaceable if validation justifies more Shopify apps.

The system is not an accounting ledger, payment processor, credit bureau, legal
collection service, or autonomous decision maker.

## 3. Context and trust boundaries

See [context.mmd](diagrams/context.mmd) and [container.mmd](diagrams/container.mmd).

### People and external systems

- Merchant staff use the app within Shopify admin.
- Shopify authenticates sessions, supplies GraphQL data and webhooks, and owns
  subscription pricing and state.
- Wholesale buyer contacts receive transactional collection email; they do not
  log into the MVP.
- Postmark accepts messages and reports delivery, bounce, complaint, and
  suppression events.
- Render hosts compute and PostgreSQL for the pilot.
- Sentry and the logging/metrics backend receive redacted operational telemetry.

### Trust boundaries

- Browser input, embedded-session claims, Shopify webhooks, email-provider
  webhooks, GraphQL responses, and imported text are untrusted.
- The web process is public; the worker and database are not publicly exposed.
- Production customer data never enters local development, preview, or test
  environments.
- Operator access to production protected data is an exceptional audited action.

## 4. Container view

| Container | Responsibility | Scale unit |
|---|---|---|
| Embedded web app | Session validation, UI/server routes, webhook intake, Shopify callbacks, merchant commands, read APIs | Stateless web instance |
| Background worker | Sync, reconciliation, scheduling, eligibility checks, statements, email and provider-event processing, retention | Worker instance with queue-specific concurrency |
| PostgreSQL | Transactional state, synchronized projection, outbox-like jobs, idempotency, audit records | Managed primary plus encrypted backups |
| Shopify GraphQL Admin API | Authoritative companies, contacts, orders, payment terms, outstanding balances and transactions | Per-shop cost budget |
| Shopify Partner API | Canonical active subscription and historical billing events | Cached read with fail-safe entitlements |
| Postmark | Transactional delivery and suppression feedback | Per-message API call |
| Observability services | Redacted errors, structured logs, metrics, alert routing | Asynchronous telemetry |

The web and worker use the same versioned container image, configuration schema,
domain modules, migrations, and database. They differ only by process command.

## 5. Module boundaries

```text
app/
  platform/shopify/   auth, token rotation, GraphQL, webhooks, throttling
  tenancy/            shop lifecycle, configuration, tenant guards
  receivables/        Shopify projection, aging, reconciliation
  collections/        queue, notes, promises, reliability facts
  reminders/          policies, scheduling, templates, eligibility, delivery
  statements/         statement model, rendering, CSV export
  billing/            subscription snapshots and entitlement decisions
  privacy/            access requests, redaction, retention, uninstall purge
  operations/         audits, support actions, health, metrics, diagnostics
  adapters/           Prisma, pg-boss, Postmark, Sentry, object storage if added
```

Domain modules expose application services and typed ports. Shopify GraphQL,
Postmark, Prisma, `pg-boss`, and hosting APIs remain adapter details. Modules do
not query another module's tables directly; cross-module behavior uses an
application service or a published internal event. This rule is enforced by
imports and review initially, not separate services.

### Data ownership

Shopify owns:

- company, company-location, contact relationship, order and payment-term facts;
- outstanding balances, paid/canceled/refunded state, transactions and currency;
- shop identity, installation scopes, and subscription commerce.

The app owns:

- projections and reconciliation state;
- collection policies, queues, notes, promises, snoozes and suppressions;
- reminder reservations, rendered message snapshots and delivery history;
- explainable payment-reliability facts;
- entitlement snapshots, privacy workflows and audit events.

The app never mutates Shopify payment state in the MVP. An external-payment note
is explicitly non-authoritative.

## 6. Primary interfaces

### Merchant-facing HTTP

- React Router loaders/actions form the server API; no separate public REST API
  is needed for the MVP.
- Every request validates the Shopify session token, resolves a stable internal
  `shop_id`, authorizes the operation, and scopes all reads/writes to that shop.
- Mutating actions use CSRF-safe framework patterns and an application command
  idempotency key where retries are plausible.
- Form and imported text is length-limited and rendered as escaped text.

### Webhook intake

- Shopify endpoints verify HMAC against the raw body, record topic, webhook ID,
  event ID, API version, shop domain and receipt time, then durably enqueue work
  before returning 2xx.
- Provider endpoints verify provider authentication/signature before accepting
  delivery events.
- Receipt IDs are unique per provider and tenant. Duplicate delivery succeeds
  without repeating side effects.
- Payloads are minimized with Shopify `include_fields`, encrypted at rest and
  removed seven days after successful processing.

### Internal jobs

Every job has a versioned payload, stable tenant ID, correlation ID, attempt
limit, timeout, backoff policy and terminal-failure route. Handlers are
idempotent. Jobs enqueue within the same PostgreSQL transaction as the state
change that requires them whenever possible.

Initial queues:

- `shopify.sync`, `shopify.reconcile`, `shopify.token-refresh`
- `webhook.shopify`, `webhook.postmark`
- `reminders.plan`, `reminders.validate`, `reminders.send`
- `statements.render`, `privacy.process`, `retention.purge`

Concurrency and rate limits are applied per shop so one large merchant cannot
starve the rest.

## 7. Synchronization and consistency

The local model is an eventually consistent projection. Webhooks reduce
latency; GraphQL reconciliation establishes correctness.

1. Initial sync imports the minimum company/contact and in-scope payment-term
   order fields, using bulk operations where volume justifies them.
2. Incremental webhooks trigger idempotent targeted refreshes. Webhook payloads
   are notifications, not a trusted complete ledger.
3. Source `updatedAt` and current GraphQL state resolve out-of-order delivery.
4. An hourly incremental reconciliation checks recently changed and active
   receivables. A daily bounded sweep repairs older drift.
5. A full merchant-triggered repair is available to support and the merchant.
6. The UI exposes `syncing`, `partial`, `reconciling`, `fresh`, `stale`, and
   `failed` states. Partial totals are never labeled complete.

Projection writes use optimistic version/source timestamp checks. Deletes are
tombstoned long enough to reject a stale resurrection and then purged under the
retention policy.

## 8. Reminder safety protocol

At-most-once delivery from the merchant's perspective takes priority over
automatic retry after an ambiguous provider result.

1. Scheduler creates a candidate for a specific shop, receivable, policy
   version and stage.
2. A database transaction obtains a row lock, checks global pause,
   entitlement, stage state, company/contact suppression and existing delivery,
   then creates a unique delivery reservation.
3. Immediately before send, the worker fetches current Shopify order/payment
   schedule state. Shopify unavailability or ambiguity fails closed.
4. The worker renders from a versioned template and immutable snapshot,
   validates recipient and headers, and marks the attempt `SENDING` before the
   provider call.
5. A successful Postmark response records provider message ID and `ACCEPTED`.
6. A definite pre-acceptance failure can retry with bounded backoff.
7. A timeout or process failure after the request might have reached Postmark is
   marked `UNKNOWN`. It is not automatically resent; an operator reconciles it
   using provider evidence.
8. Provider webhooks advance monotonic delivery state. Hard bounce, complaint,
   or provider suppression creates a recipient suppression.

A unique constraint on `(shop_id, receivable_id, policy_version_id, stage_id)`
is the final duplicate-send guard. Global pause is checked in the database and
again immediately before the provider call.

## 9. Data and privacy design

The detailed model is in [data-model.md](data-model.md). The app requests Level
2 protected customer data because sending a reminder needs an email address,
but requests only the email protected field—not name, address, or phone.

- Buyer email is application-encrypted with an envelope key and also stored as
  a keyed HMAC for exact deduplication; plaintext is not indexed.
- Access and refresh tokens are envelope-encrypted with separate key context.
- Logs contain internal IDs, categories and correlations, never tokens, email
  addresses, message bodies or raw webhook payloads.
- Production and non-production databases, keys, accounts and provider streams
  are separate.
- Protected-data support access is least privilege, time bounded and audited.

### Retention baseline

| Data | Retention/action |
|---|---|
| Processed encrypted webhook body | Delete after 7 days |
| Redacted application logs | 30 days |
| Contact email, notes and message snapshots | While installed and required; delete on applicable redaction/shop purge |
| Delivery/audit metadata without message content | 1 year, then aggregate or delete |
| Database backups | 35 days maximum, encrypted |
| Uninstalled tenant | Disable immediately; purge protected data on `shop/redact` or the required schedule |

Restores must apply a durable deletion-tombstone ledger before restored data can
serve traffic. Retention values are product defaults and require legal review
before public launch.

## 10. Security controls

The full analysis is in [threat-model.md](threat-model.md). Required controls
include:

- Shopify session verification, HMAC verification on the raw webhook body and
  expiring offline-token rotation;
- tenant-scoped repositories plus composite tenant foreign/unique keys;
- TLS in transit and managed encryption plus application encryption at rest;
- least-privilege scopes and Level-2 protected-data controls;
- secret-manager configuration, key rotation and no secrets in images or Git;
- output encoding, safe template variables, CSV formula neutralization and
  email header validation;
- audited support access, strong MFA, incident response and dependency scanning;
- bounded payloads, queue concurrency, query timeouts and per-tenant budgets.

The reliability summary is informational and explainable. It cannot block an
order, alter terms, rank a person by protected characteristics or be presented
as a credit score.

## 11. Reliability, performance and service targets

Pilot targets:

| Signal | Target |
|---|---|
| Webhook durable acceptance | p95 under 1 second; 99.9% monthly |
| Normal incremental projection lag | p95 under 5 minutes |
| Active receivable reconciliation | At least hourly |
| Reminder safety | Zero known duplicate or paid/canceled sends |
| Dashboard API | p95 under 500 ms excluding initial HTML/network |
| Job terminal-failure age | Alert within 10 minutes for send/privacy; 30 minutes otherwise |
| Token refresh failure | Alert before token expiry creates downtime |
| Web UI | Shopify current Built for Shopify Web Vital targets at p75 |

Each process emits request/job counts, duration, error rate and saturation.
Domain metrics include sync lag, reconciliation mismatches, webhook duplicate
rate, queue age, unknown sends, bounces, complaints and privacy-request age.

## 12. Failure modes and recovery

| Failure | Safe behavior | Recovery |
|---|---|---|
| Missed or out-of-order Shopify webhook | Projection may show stale; unsafe sends stop | Targeted/hourly reconciliation |
| Shopify API throttling | Per-shop backoff; other shops continue | Retry using cost metadata and jitter |
| Shopify unavailable before a reminder | No send | Retry validation later within policy window |
| Duplicate job/webhook | Unique receipt and domain constraints no-op | Acknowledge duplicate |
| Postmark definite rejection | No accepted send; bounded retry if safe | Fix/suppress and retry explicitly |
| Postmark ambiguous timeout | Mark `UNKNOWN`; never auto-resend | Provider lookup/operator decision |
| Database unavailable | Web/UI fail safely; no email | Managed recovery, then queue replay |
| Worker crash | Leased jobs return to queue | Idempotent retry, except ambiguous send path |
| Bad release/migration | Health checks prevent promotion | Roll back image; forward-fix compatible schema |
| Token refresh failure | Pause Shopify-dependent work before expiry | Refresh/re-auth operational flow |
| Subscription API unavailable | Use short-lived last-known snapshot; deny new paid-only changes when stale | Re-query Partner API |
| Uninstall/privacy request | Disable jobs immediately | Audited purge job and retry until complete |

## 13. Deployment and change management

Reference pilot deployment:

- one Render web service and one background worker from the same immutable
  container image;
- one private managed PostgreSQL database in the same region;
- separate development, preview and production services, databases, secrets,
  Postmark streams and Shopify apps;
- automated migrations as a gated release job, not on every web-process start;
- backward-compatible expand/migrate/contract schema changes;
- health/readiness checks and a last-known-good image for rollback;
- encrypted backups and a quarterly restore exercise before public launch.

No production code is scaffolded until this architecture is approved. After
approval, the first implementation slice must prove install, expiring offline
token persistence, webhook verification, one durable idempotent job,
uninstallation disablement and observability end to end.

## 14. Scaling assumptions and evolution triggers

The first target is 100 installed shops, fewer than 50 paying shops, under
100,000 active receivables and conservative reminder volumes. PostgreSQL and a
small worker pool are sufficient at this scale.

Scale vertically first, add indexes from measured queries, then add worker
instances and queue-specific concurrency. Consider Redis, a separate job system
or a service split only if measured queue throughput, provider isolation,
availability or team ownership cannot be met by the modular monolith. Partition
large event/delivery tables only after query and storage evidence supports it.

## 15. Architecture gate checklist

- [x] Product owner accepts source-of-truth and eventual-consistency behavior.
- [x] Product owner accepts fail-closed and ambiguous-send behavior.
- [ ] Required Shopify scopes/fields work on a B2B development store.
- [x] Level-2 protected-data request and privacy evidence plan are accepted.
- [x] Data model and tenant constraints are reviewed.
- [x] Threats and residual risks are accepted.
- [ ] Render region and initial monthly budget are selected before pilot data.
- [ ] Postmark account/sending domain and reply-to verification flow are proven.
- [x] ADRs are accepted or superseded.
- [x] Implementation tasks are derived before scaffolding.

## 16. References

- [Shopify recommended React Router scaffold](https://shopify.dev/docs/apps/build/scaffold-app)
- [Shopify API versioning](https://shopify.dev/docs/api/usage/versioning)
- [Shopify GraphQL rate limits](https://shopify.dev/docs/api/usage/limits)
- [Shopify protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [Shopify offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens)
- [Shopify webhook subscriptions](https://shopify.dev/docs/apps/build/webhooks/subscribe)
- [Shopify App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing)
- [`pg-boss` project](https://github.com/timgit/pg-boss)
- [Postmark webhook overview](https://postmarkapp.com/developer/webhooks/webhooks-overview)
- [Render background workers](https://render.com/docs/background-workers)
