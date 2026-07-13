# Product Requirements Document

**Status:** Approved
**Date:** 2026-07-13
**Approved:** 2026-07-14
**Product:** B2B A/R Collections Assistant

## 1. Product summary

The B2B A/R Collections Assistant is an embedded Shopify app for beauty
wholesalers that converts payment-term orders into an accurate aging dashboard,
a prioritized daily collections queue, and merchant-controlled reminder
automation.

**Core promise:** Get Shopify wholesale invoices paid without spreadsheets or
manual chasing.

## 2. Goals

### Merchant goals

- Know exactly which Shopify B2B balances are due or overdue.
- Decide what collection action to take today.
- Stop repetitive manual reminder work without risking inappropriate sends.
- Preserve context about conversations and promises.
- Recognize repeat late payers before extending more terms.

### Product goals

- Deliver first value within five minutes for a typical pilot store.
- Become a weekly or daily operational tool rather than a passive report.
- Demonstrate measurable willingness to pay for a Shopify operational app.
- Acquire merchants through self-serve Shopify discovery and content.
- Establish reusable platform foundations for later Shopify apps.

### Business experiment goals

Within 90 days of public launch:

- 100 qualified installs
- 20 paying merchants
- $750-$1,000 MRR
- At least 50% paid retention after 60 days
- At least 30% of installs from Shopify App Store discovery
- Less than one support hour per paying merchant per month

## 3. Non-goals

- Replace accounting software.
- Collect or transfer money.
- Make legal collection decisions.
- Produce a regulated credit score.
- Synchronize accounting or bank systems in the MVP.
- Serve every wholesale vertical in the first release.
- Automate customer communication without merchant-visible controls.

## 4. Personas

### Maya - founder/operator

Maya runs a growing beauty brand with wholesale accounts. She checks Shopify,
email, and a spreadsheet to learn which boutiques owe money. She wants a short
daily list and safe automation, not another finance platform.

### Daniel - finance administrator

Daniel manages invoices and follow-ups for a larger beauty wholesaler. He needs
accurate aging, statements, notes, promises, exports, and evidence of what was
sent. Reliability matters more than novelty.

### Sara - operations staff

Sara reviews or fulfills wholesale orders. She needs a clear warning when a
buyer is significantly overdue, but she should not make accounting changes.

## 5. Core user journeys

### Journey A - Install and reach first value

1. Maya installs the app from Shopify.
2. She sees the requested data access and completes installation.
3. The app begins a visible initial sync.
4. She sees partial progress without misleading totals.
5. Reconciliation completes.
6. Maya sees aging buckets and the highest-priority overdue accounts.
7. She previews the collections queue and is invited to configure reminders.

**Success:** A trustworthy dashboard appears within five minutes for a typical
pilot store, or progress and an honest completion estimate remain visible.

### Journey B - Work the daily queue

1. Daniel opens Today's Collections.
2. He sees accounts ordered by explainable urgency.
3. He opens a company and reviews balances, previous reminders, and promises.
4. He adds a note, records a promise, snoozes the item, or sends an approved
   reminder.
5. The action appears immediately in the timeline.

**Success:** Daniel can complete routine collection work without a spreadsheet
or inbox search.

### Journey C - Enable safe automation

1. Maya chooses a recommended beauty-wholesale reminder policy.
2. She adjusts timing and message language.
3. She sets the sender name and verified reply-to address.
4. She previews every stage.
5. She approves and activates the policy.
6. The app rechecks payment and suppression state before each send.
7. Maya can pause all automation instantly.

**Success:** Automation reduces manual work without duplicate or inappropriate
email.

### Journey D - Handle an external-payment claim

1. A buyer says payment was sent outside Shopify.
2. Daniel records a dated external-payment note.
3. The app labels it non-authoritative and optionally suppresses reminders for
   a merchant-selected period.
4. Shopify's outstanding balance remains unchanged until Shopify records the
   payment.

**Success:** Operational context is preserved without falsifying the ledger.

### Journey E - Recover from missed data

1. The app detects sync lag or a reconciliation mismatch.
2. Sending is paused for affected receivables when safety is uncertain.
3. A reconciliation job fetches current Shopify state.
4. The dashboard and queue are repaired.
5. The merchant sees the restored state and an audit event.

**Success:** Missed webhooks do not create permanent incorrect balances or
unsafe reminders.

## 6. Feature priorities

### P0 - Required for pilot

- Secure install, tenant lifecycle, and subscription awareness
- Initial sync and reconciliation
- Aging dashboard and company detail
- Daily collections queue
- Notes and promises to pay
- Reminder policy preview, approval, pause, suppression, and idempotent sending
- Email delivery status and failure handling
- Statements and CSV export
- Privacy webhooks and uninstall cleanup
- Audit trail, monitoring, diagnostics, and recovery

### P1 - Required before or shortly after public launch

- Weekly collections summary
- Improved reliability insights
- Informational overdue warning on the best available Shopify surface
- Guided onboarding and seeded demo state
- Annual plans and polished plan-limit messaging
- Self-serve support diagnostics

### P2 - Consider only after market validation

- QuickBooks or Xero integration
- Merchant-owned sending domains
- Customer payment portal
- Team roles and approvals
- Shopify Flow actions
- Advanced risk rules
- Additional wholesale vertical templates
- Portfolio-level shared Shopify platform services

## 7. User stories and acceptance criteria

### Story 1 - See trusted aging

As a finance administrator, I want an aging dashboard based on current Shopify
state so that I know which balances require attention.

Acceptance criteria:

- Aging buckets use the authoritative due date and calendar-day lateness.
- Partial payments and refunds change the outstanding amount.
- Paid and canceled orders do not remain in active totals.
- Different currencies are not silently summed.
- Sync timestamp and reconciliation state are visible.
- A missed webhook can be repaired through reconciliation.

### Story 2 - Work a prioritized queue

As an operator, I want a daily queue so that I know what to do next.

Acceptance criteria:

- Every item has a visible priority explanation.
- Paid or canceled receivables do not appear as actionable.
- Notes, promises, snoozes, and sends update the timeline.
- Queue state remains stable across refreshes and retries.

### Story 3 - Automate reminders safely

As an owner, I want controlled reminder automation so that buyers are contacted
consistently without embarrassing duplicate or incorrect messages.

Acceptance criteria:

- A policy cannot activate before preview and explicit approval during pilot.
- A global pause immediately prevents new sends.
- Eligibility is checked immediately before delivery.
- A receivable-policy stage cannot send twice.
- Paid, canceled, suppressed, or disputed items are excluded.
- Delivery failures and suppression are visible.

### Story 4 - Record a promise

As a finance administrator, I want to record a buyer's promise to pay so that
the team shares the same context.

Acceptance criteria:

- A promise records date, optional amount, note, creator, and timestamp.
- It does not change Shopify's payment state.
- Its status is visible in company history and queue prioritization.
- Broken and superseded promises remain auditable.

### Story 5 - Understand a buyer's history

As an owner, I want an understandable payment-reliability summary so that I can
make better operational decisions.

Acceptance criteria:

- The summary uses explainable Shopify-recorded payment behavior.
- The app shows contributing facts such as average days late and late-payment
  count.
- It is not labeled or represented as a regulated credit score.

### Story 6 - Control plan limits

As a merchant, I want transparent pricing limits so that I understand why an
upgrade is needed.

Acceptance criteria:

- The free plan supports five active payment-term customers.
- Existing data is not deleted when a limit is exceeded or a plan downgrades.
- Restricted actions explain the applicable limit and upgrade route.
- Worker-side enforcement matches UI enforcement.

## 8. Experience requirements

- The application feels native inside Shopify admin.
- The dashboard leads with decisions and exceptions, not charts for their own
  sake.
- Every monetary figure exposes its currency and data freshness.
- Sending and automation controls favor clarity over density.
- Loading, partial-sync, stale, error, paused, empty, and healthy states have
  distinct presentations.
- Responsive layouts remain usable in Shopify's mobile admin surfaces.
- Accessibility is part of acceptance, not a later polish phase.

## 9. Pricing hypothesis

- Free: up to five active payment-term customers and limited manual workflows
- Starter: $19/month, up to 50 active customers
- Growth: $39/month, up to 250 active customers
- Scale: $79/month, expanded users, exports, and future integrations
- Monthly and annual paid options through Shopify App Pricing

Pilot pricing should require a real payment commitment while allowing direct
feedback and early limitations.

## 10. Launch plan

### Paid pilot

- Recruit three to five Shopify beauty wholesalers.
- Configure stores and policies with hands-on founder support.
- Begin with manual approval and conservative sending.
- Measure time to first value, aging correctness, queue usage, send safety,
  collection outcomes, objections, and support time.

### App Store launch

- Publish only after pilot safety and usefulness thresholds pass.
- Position around Net terms, overdue invoices, wholesale payment reminders,
  and accounts receivable.
- Use a free aging-report tool, reminder templates, short product demos, SEO,
  and beauty-wholesale content for acquisition.
- Start the 90-day Shopify market experiment on public launch.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Incorrect balance or aging | Shopify remains authoritative; reconciliation, timestamps, and visible freshness |
| Duplicate or inappropriate email | Idempotency keys, immediate eligibility checks, suppression, pause, and pilot approval |
| Email deliverability | Verified managed domain, provider events, bounce/complaint suppression, conservative volumes |
| Protected data rejection | Minimize fields/scopes and design privacy before implementation |
| Merchant expects accounting behavior | Explicit non-goals and non-authoritative external-payment notes |
| Shopify absorbs basic reminders | Differentiate on the daily queue, context, promises, reliability, and safe workflow |
| Weak App Store demand | Paid pilot first, then explicit 90-day continuation thresholds |
| High support load | Self-serve onboarding, observable sync, diagnostics, and narrow initial niche |

## 12. Deliverables for the next phase

After this PRD and `requirements.md` are approved:

- Architecture document and diagrams
- Initial data model
- Shopify API field and scope verification
- Threat model and privacy/data-retention design
- ADRs for synchronization, job execution, email identity, hosting, and billing
- Task breakdown and implementation plan

No production application code should be scaffolded before those deliverables
are reviewed.
