# Development Workflow Analysis

**Analyzed:** 2026-07-13
**Source:** `../../../DEVELOPMENT_WORKFLOW.md`

## Conclusion

The workspace workflow is a sound project-governance baseline. It encourages
requirements-first delivery, explicit architecture, small tasks, reviews,
testing, documentation, and phase audits. We should keep it.

It is intentionally generic, however, and it needs a Shopify-specific layer
before it can safely govern a public app that reads order and customer data and
sends automated email.

## What is already strong

- Clear exit criteria discourage coding against vague requirements.
- Architecture precedes task decomposition and implementation.
- Small, independently reviewable tasks reduce regression risk.
- Dedicated security, performance, architecture, and edge-case review is
  required.
- Unit, integration, API, and end-to-end testing are all recognized.
- Phase audits create good stopping points for checking scope and technical
  debt.
- The definition of done includes code, tests, review, and documentation.

## Gaps to close

### 1. Product validation is missing

The workflow starts at requirements. For a new commercial app, a short market
and willingness-to-pay gate must come first. Otherwise, the team can execute
perfectly on an unvalidated product.

### 2. Platform compliance is not a named workstream

The app will need GraphQL-only Admin API usage, protected-customer-data review,
mandatory privacy webhooks, secure token rotation, Shopify billing, API-version
management, app review, and uninstall cleanup. These cannot be postponed until
deployment.

### 3. Reliability needs explicit design artifacts

The generic architecture phase should require data ownership, idempotency,
delivery guarantees, reconciliation, retry policy, dead-letter handling,
backfill, migration rollback, and operational recovery for this app.

### 4. Security needs an earlier gate

Security appears primarily during review. Threat modeling, least-privilege
scopes, tenant isolation, encryption, data minimization, retention, redaction,
and secret rotation should be approved with the architecture.

### 5. Testing and documentation are too sequential

The standard diagram places review, then testing, and documentation after
deployment. In practice, tests and documentation must be created with each
task. A final test and documentation audit still belongs before release.

### 6. Release readiness needs two stages

For this app, "deployment" is not one event. We need a controlled paid pilot
before public App Store submission, followed by App Store review and staged
production rollout.

### 7. Operations need measurable expectations

The workflow asks for monitoring but not service targets. Before the pilot, we
should define alert thresholds for webhook failures, sync lag, reminder-send
failures, token-refresh failures, queue age, and elevated GraphQL throttling.

## Applied adaptation

The local `DEVELOPMENT_WORKFLOW.md` adds:

- a market-validation and product decision gate;
- architecture, ADR, privacy, and threat-model approval before coding;
- continuous tests and documentation;
- Shopify platform and App Store requirements;
- separate pilot and public-release gates;
- reliability tests for duplicate, delayed, missed, and out-of-order events;
- operational readiness and rollback requirements.

## Current workflow decision

The product, requirements, and PRD gates were approved on 2026-07-14. The next
gate is review of the architecture, Shopify integration contract, data model,
threat model, and ADRs. Application scaffolding begins only after that package
is approved and converted into independently reviewable tasks.
