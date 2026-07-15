# Threat Model

**Status:** Approved
**Method:** STRIDE-informed abuse-case review
**Date:** 2026-07-14
**Approved:** 2026-07-15

## 1. Scope and security objectives

This model covers the embedded web app, worker, PostgreSQL, Shopify and Postmark
interfaces, observability, operator access, generated statements and backups.

Security objectives:

1. A user or job from one shop can never read or change another shop's data.
2. Only authentic Shopify sessions/webhooks and Postmark events cause effects.
3. Tokens, buyer email and message content remain confidential.
4. Shopify payment truth cannot be silently replaced by local input.
5. A reminder is never knowingly sent twice or after it becomes ineligible.
6. Privacy deletion is complete, auditable and survives backup restoration.
7. Operators can diagnose failures without routinely viewing protected data.

## 2. Assets and adversaries

High-value assets are Shopify access/refresh tokens, buyer email, receivable
facts, merchant notes, reminder content, delivery history, tenant identity,
subscription entitlements, encryption keys and audit trails.

Adversaries include an unauthenticated internet actor, a malicious or
compromised merchant staff account, a compromised dependency/provider, an
over-privileged operator, an attacker with database/backup access, and an
accidental developer or operational error.

## 3. Trust boundaries and entry points

- Browser to public embedded web service
- Shopify webhook/callback to public web service
- Postmark webhook to public web service
- Web/worker to PostgreSQL
- Worker to Shopify Admin and Partner APIs
- Worker to Postmark
- Web/worker to telemetry providers
- Operator/support tooling to production services
- Build pipeline and dependency registry to runtime image

## 4. Threat register

| ID | Threat/abuse case | Impact | Primary controls | Residual risk/action |
|---|---|---|---|---|
| T01 | Forged or replayed embedded request | Cross-tenant disclosure or action | Verify Shopify session token, issuer/audience/expiry; derive tenant server-side; command idempotency | Contract and end-to-end auth tests |
| T02 | Cross-tenant IDOR using another shop's record UUID | Protected-data breach | Tenant-scoped repositories; `shop_id` composite keys/FKs; never authorize by client IDs alone | Add isolation tests to every repository |
| T03 | Forged, modified or replayed Shopify webhook | Corrupt projection or trigger work | Raw-body HMAC, bounded payload, shop mapping, unique webhook ID, idempotent handler | Rotate app secret through runbook |
| T04 | Duplicate/out-of-order/missed event | Wrong balance or duplicate reminder | Receipt dedupe, source timestamp/current GraphQL refresh, unique domain constraints, reconciliation | Eventual stale display remains; show freshness |
| T05 | Offline/refresh token theft | Broad Shopify data access | Envelope encryption, secret manager, no logs/browser exposure, expiring rotation, least scopes, access alerting | Provider/database compromise remains incident-grade |
| T06 | Concurrent token rotation overwrites new refresh token | Loss of Shopify access | Distributed lock plus compare-and-swap token version; atomic encrypted persistence | Re-auth flow and pre-expiry alert |
| T07 | Local note or stale projection marks debt paid | Missed collection or unsafe accounting claim | Shopify is sole payment authority; external-payment notes visually separate; live pre-send validation | Merchant may misunderstand; UX testing required |
| T08 | Paid/canceled/suppressed buyer receives reminder | Reputational and legal harm | Fail-closed live GraphQL check, global pause, suppression, transaction lock, eligibility evidence | Shopify outage delays valid reminders by design |
| T09 | Duplicate reminder from retry/race | Reputational harm | Unique receivable/policy-version/stage constraint, reservation transaction, idempotent jobs | At-most-once chosen over maximum delivery |
| T10 | Provider accepted message but response timed out | Accidental resend | Mark `UNKNOWN`, never auto-retry ambiguous attempt, reconcile provider evidence | Some valid mail may be missed; explicit operator action |
| T11 | Forged Postmark delivery/bounce event | False state or suppression | Provider webhook authentication/token, event dedupe, validate event-to-message/shop mapping | Periodic provider reconciliation if supported |
| T12 | Email header or template injection | Spam, content manipulation, data leakage | Strict email parser, CR/LF rejection, fixed From domain, allowlisted variables, escaped text/HTML, length limits | Templates need security test corpus |
| T13 | Stored XSS in company/note/template content | Session compromise/action forgery | Framework escaping, no unsafe HTML, sanitization if rich text added, CSP where compatible | Shopify iframe constraints need validation |
| T14 | CSV formula injection | Merchant workstation compromise | Prefix dangerous cell starts, quote correctly, UTF-8 export warning | Test Excel/Sheets behavior |
| T15 | Generated statement URL guessed/shared | Protected-data leak | Private storage, short-lived signed URLs, tenant authorization, no PII filenames, access audit | Downloaded copies leave app control |
| T16 | Protected data leaks to logs/errors/jobs | Privacy breach | Structured allowlist logging, scrubber tests, IDs only in jobs, Sentry denylist, no raw payload/body | Vendor configuration audit before pilot |
| T17 | Database or backup exfiltration | Large protected-data breach | Managed encryption, app encryption for email/content/tokens, encrypted backups, key separation, network isolation | Key+database joint compromise remains severe |
| T18 | Production data copied to development | Uncontrolled exposure | Separate accounts/projects/keys/databases; synthetic fixtures only; deny production export in tooling | Process audit and DLP alerting |
| T19 | Privacy deletion misses a table or restored backup | Compliance/privacy failure | Central subject index/HMAC, deletion tests, FK inventory, tombstone replay on restore, backup expiry | Legal validation of retention policy needed |
| T20 | Subscription snapshot is stale/manipulated | Revenue loss or improper feature access | Partner API canonical, signed Shopify flow, short cache, common UI/worker entitlement service, fail safe for new actions | Brief grace access may be intentional |
| T21 | Resource exhaustion by large shop or malicious payload | Availability/cost impact | Payload/query limits, per-shop budgets/concurrency, timeouts, queue priority, GraphQL cost control | Rate tiers tuned from pilot metrics |
| T22 | Support operator abuses access/action | Protected-data breach or harmful send | MFA, least privilege, just-in-time access, reason/approval, protected-data access log, no direct send by default | Small-team separation of duty may be limited |
| T23 | Dependency/build compromise | Code execution/data exfiltration | Lockfile, minimal dependencies, automated vulnerability/license scans, signed/immutable images, protected CI secrets | Establish update SLA before pilot |
| T24 | Bad migration/release corrupts state | Outage or incorrect reminders | Expand/migrate/contract, backup/restore test, canary/health checks, rollback image, pause sends during risky migration | Data rollback often forward-fix only |
| T25 | Reliability summary becomes discriminatory credit decision | Merchant/buyer harm and regulatory exposure | Explainable facts only, no protected traits, no auto-block/term mutation, label not a credit score | Legal/product review before advanced rules |
| T26 | Unsubscribe/complaint ignored | Reputational/compliance harm | Provider suppressions, local recipient/company suppression, global pause, pre-send check, audit | Transactional-message legal basis varies by region |

## 5. Privacy and Level-2 evidence plan

Before App Store submission, maintain evidence for Shopify's protected customer
data review:

- field/scope inventory proving email-only Level-2 access;
- public privacy notice with purposes, retention and subprocessors;
- encryption-at-rest/in-transit and encrypted-backup evidence;
- separate production/test architecture and synthetic-data procedure;
- staff access policy, MFA evidence and protected-data access logs;
- DLP controls for logs, exports, email and support tooling;
- retention jobs, redaction tests and restore-tombstone test results;
- incident response plan with severity, containment, notification and evidence
  handling;
- dependency, access and security-review records.

## 6. Required security tests

### Automated

- Tenant A cannot access Tenant B through every loader/action and repository.
- Invalid/changed/replayed webhook signatures have no side effects.
- Duplicate and reversed webhook sequences converge to current Shopify state.
- Concurrent send candidates create exactly one reservation.
- Paid/canceled/suppressed/global-pause changes immediately prevent send.
- Ambiguous provider timeout cannot enter an automatic retry path.
- HTML/template/header payloads remain inert and correctly encoded.
- CSV values beginning `=`, `+`, `-`, `@`, tab or carriage return are neutralized.
- Logs, traces, exception events and queue payloads contain no seeded secrets,
  buyer email or message content.
- Customer and shop redaction remove protected data from every owned table and
  generated object.
- Restored backups replay deletion tombstones before serving.

### Manual/operational

- Rotate Shopify, Postmark, database and application encryption credentials.
- Revoke an operator and confirm access removal/audit.
- Restore PostgreSQL into an isolated environment and prove deletion replay.
- Run an incident tabletop for leaked Shopify token and mistaken bulk reminder.
- Review all scopes and subprocessors before pilot and public submission.

## 7. Incident safety switches

- Global database-backed reminder pause, checked by every send worker.
- Per-shop, per-policy, per-company and per-recipient pause/suppression.
- Ability to stop reminder queue consumption without stopping privacy or token
  jobs.
- Ability to disable a compromised shop/token and invalidate sessions.
- Feature flags to disable imports, statements, billing changes or provider
  webhooks independently.
- Audited operator resolution for `UNKNOWN` deliveries; no mass resend button.

## 8. Accepted design tradeoffs

- A reminder may be delayed or missed during Shopify/provider ambiguity because
  avoiding duplicate or incorrect debt email is more important than delivery
  availability.
- The app stores buyer email because direct reminders are the product wedge;
  without it, Level-2 exposure could be avoided but the MVP would not work.
- Company name and receivable facts are retained locally for performance and
  workflow history, but Shopify remains authoritative and reconciliation is
  mandatory.
- Render, Postmark and PostgreSQL concentrate provider risk for a fast pilot;
  documented ports, exports and backups preserve an exit path.

## 9. Review triggers

Repeat threat modeling when adding write scopes, payment links, customer portal,
custom sending domains, accounting integrations, team roles, AI-generated
messages, automated order blocking, new regions/providers or a service split.
