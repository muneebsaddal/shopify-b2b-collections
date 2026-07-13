# Development Workflow

This project follows the workspace workflow at `../../DEVELOPMENT_WORKFLOW.md`
with the Shopify-specific gates below. The root workflow remains authoritative
where this file does not add a stricter requirement.

## Working principles

1. Do not scaffold production code until requirements, MVP scope, and the
   first architecture decisions are approved.
2. Use a modular monolith by default. Add infrastructure only when a concrete
   reliability or scaling requirement justifies it.
3. Treat Shopify as the source of truth for orders, payment status, companies,
   and company locations. The app owns collection policies, reminders, notes,
   promises to pay, explainable reliability summaries, and audit history.
4. Treat webhooks as untrusted, duplicated, and possibly out of order.
5. Build privacy, tenant isolation, observability, and uninstall cleanup into
   the first vertical slice.
6. Prefer small, reviewable tasks with tests and documentation completed in the
   same task.

## Adapted phase sequence

```text
Market validation and decision gates
    -> Requirements
    -> PRD
    -> Architecture, ADRs, privacy, and threat model
    -> Task breakdown
    -> Project context
    -> Per-task implementation plans
    -> Incremental implementation with tests
    -> Review and phase audit
    -> Pilot readiness
    -> Shopify App Store readiness
    -> Production release and operations
```

## Shopify-specific exit gates

### Product gate

- Initial merchant segment and core workflow are explicit.
- MVP excludes accounting, lending, debt collection, and payment movement.
- A merchant can reach the first useful aging view during onboarding.
- Pilot and public-launch success thresholds are measurable.

### Architecture gate

- System boundary, containers, interfaces, and data ownership are documented.
- API version and required GraphQL scopes are recorded.
- Protected customer data usage is minimized and justified.
- Expiring offline-token storage and rotation are designed.
- Webhook HMAC verification, deduplication, retries, reconciliation, and
  backfill are designed.
- Reminder delivery, suppression, unsubscribe behavior, and auditability are
  designed.
- Tenant isolation, retention, redaction, uninstall, backup, restore, and
  migration rollback are defined.
- Consequential decisions have ADRs.

### Implementation gate for every task

- Acceptance criteria are linked.
- Unit or integration tests are added with the behavior.
- Relevant documentation is updated in the same change.
- Review finds no unresolved critical security, data-integrity, or
  architecture issue.
- The task is independently releasable or safely hidden behind a feature flag.

### Pilot gate

- Seeded development stores cover current, overdue, paid, partially paid,
  refunded, edited, and canceled order scenarios.
- Duplicate and out-of-order webhook tests pass.
- Reconciliation can repair a deliberately missed webhook.
- Reminder sends are idempotent and cannot double-send.
- Privacy webhooks and uninstall cleanup pass end-to-end tests.
- Billing is tested with Shopify's private test plan.
- Monitoring, alerting, support diagnostics, and rollback are operational.

### Public release gate

- Shopify App Store requirements and listing assets are complete.
- Protected customer data approval is obtained if required.
- Privacy policy, terms, data-retention policy, and support process are live.
- App performance and responsive embedded UI meet current Shopify guidance.
- A staged rollout and incident rollback procedure are documented.

## Documentation lifecycle

Documentation is continuous, not a final phase. Requirements, architecture,
tasks, runbooks, and handoff state must reflect the code at every completed
task. Production documentation is audited again before release.
