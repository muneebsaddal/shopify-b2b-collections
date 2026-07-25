# Active Implementation Plan

**Parent task:** F2 - Link Shopify app and prove the platform contract
**Active package:** F2-b synthetic fixtures; F2-c live protected-field proof
**Status:** IN_PROGRESS
**Started:** 2026-07-19
**Acceptance links:** `docs/tasks.md` F2; `docs/requirements.md` FR-1/FR-2;
`docs/prd.md` Story 1; `docs/architecture/shopify-integration.md` section 10
**Dependencies verified:** F1 is approved; API `2026-07`, four read scopes, and
email-only protected-data boundary are documented.
**External proof required:** Dev Dashboard organization/app, B2B development
store, scope/protected-data approval, runtime GraphQL/webhook/cost evidence,
offline-token rotation, compatibility fixtures, and App Pricing states.
**Files/modules in scope:** `shopify.app.toml`,
`app/platform/shopify/contracts/`, `docs/evidence/f2/`, and task/handoff docs.
**Risks and fail-closed controls:** No real-store response is treated as proved
until captured; no token, HMAC, buyer email, raw payload, or protected response
is committed; no write scope or unapproved protected field is selected.
**Tests/evidence planned:** Shopify `2026-07` code generation, static
least-privilege contract tests, live sanitized query/cost observations, webhook
topic/replay checks, token rotation proof, and plan-state evidence.
**Feature flag or rollback:** Contract documents are not invoked by production
routes; remove/revise them before F3 if real-store proof contradicts the schema.
**Next package:** Continue F2-b/F2-d with the combined paid/zero-outstanding
fixture, then proceed through the remaining F2 proof packages.

**Pause handoff (2026-07-20):** F2-a is complete. Basic-store installation,
scope, company/contact/email, current Net 30, multi-currency, and overdue proofs
are complete. Resume with the combined paid/zero-outstanding fixture
`F2-STANDARD-PAID`; F2 remains `IN_PROGRESS` and no later parent task may start.

## Current external dependency

Organization access is resolved, the CLI project is linked, and the Basic
development preview is ready with all four approved scopes auto-granted.
Synthetic B2B fixture scenarios and live GraphQL/protected-field observations
must now be created. Webhook proof remains dependent on a public tunnel because
localhost networking cannot receive Shopify webhooks.

## F2 local validation checkpoint

**Validated:** 2026-07-19

- F2-a is complete: the project is linked, the client ID is present without
  being copied into evidence, and Shopify CLI reports a valid configuration
  with zero errors.
- The link operation replaced local scopes with an empty set and selected
  webhook API `2026-10`; the approved four read scopes and API `2026-07` were
  restored and revalidated before installation.
- `b2b-ar-f2-basic` was created with generated test data and selected for a
  localhost dev preview. Shopify auto-granted exactly the approved four scopes.
  The live installation contract also returned shop identity, IANA timezone,
  and exactly those four scope handles without errors. Email-only protected data
  and missing-email fail-closed behavior remain to be verified.
- The live company/location/contact contract passed without errors. Locations
  and contacts were returned, and an email-only protected field was present for
  one contact. A second company had no contacts; that does not replace the
  required null/redacted-email fixture.
- The first Basic receivable fixture passed live: an unpaid current Net 30 order
  exposed a positive outstanding MoneyBag with distinct shop/presentment
  currencies preserved,
  non-due schedule timestamps, B2B company/location/contact links, and empty
  refund/transaction lists. No IDs, exact amounts, or payloads were retained.
- Its measured GraphQL cost was requested 15 / actual 11 with restore rate 100,
  and it also proves the multi-currency fixture. The corrected overdue query
  passed with unpaid/payment-pending state, positive outstanding balance, a
  due/overdue incomplete schedule, B2B links, and empty refunds/transactions.
- Four narrow Admin GraphQL operations generated types against Shopify API
  `2026-07`: installation/scopes, companies/locations/contacts/email, one
  receivable order with authoritative schedule/refund/transaction facts, and
  bounded order-page discovery.
- The contract selects buyer email only and requests exactly the four approved
  read scopes. Three least-privilege contract tests pass.
- Full local gate passed: 10 Vitest tests, ESLint, TypeScript, Prisma validation,
  and production build.
- This is schema evidence only. Runtime values, query costs, grants, webhook
  behavior, token rotation, store capabilities, and billing states remain
  external proof items.

## F1 completion record

**Task:** F1 - Scaffold and validate the application foundation
**Status:** Complete and approved
**Started:** 2026-07-15

## Files and responsibilities

- Root configuration: package scripts, TypeScript, lint, environment example,
  Docker, Shopify application configuration, and CI.
- `app/shopify.server.ts`: Shopify authentication, API version, scopes, and
  PostgreSQL-backed session adapter.
- `prisma/schema.prisma`: PostgreSQL session persistence only for this slice;
  domain tables arrive in F3 after development-store proof.
- `app/features/collections/`: preview-only fixture dashboard, authenticated
  unsynced state, styles, and tests.
- `app/routes/app._index.tsx`: authenticated embedded entry point that exposes
  no financial totals until synchronization and reconciliation exist.
- `app/routes/preview.tsx`: development-only no-auth rendering for visual QA.

## Risks and controls

- Shopify account state: local test/build must not require credentials; linking
  is isolated in F2.
- API drift: target the approved `2026-07` version and verify the installed
  package enum during type checking.
- False product behavior: sample dashboard data is labeled and imported only by
  `/preview`; authenticated users see an explicit unsynced state with no
  financial totals or collection actions.
- Release safety: the container generates Prisma Client at image build time,
  starts the web process without applying migrations, and exposes
  `npm run release:migrate` for the gated release job.
- Premature schema commitment: implement only the template-compatible session
  table in F1; introduce approved domain tables with integration tests in F3.
- Visual drift: implement from `docs/design/todays-collections-concept.png` and
  compare native desktop plus mobile screenshots before completion.

## Verification

1. Install from the committed npm lockfile.
2. Generate and validate the Prisma client against PostgreSQL schema syntax.
3. Run unit and foundation-contract tests for dashboard behavior, authenticated
   fixture isolation, API version alignment, and migration/startup separation.
4. Run ESLint and React Router/TypeScript type checking.
5. Build the production server/client bundles.
6. Run the no-auth preview and inspect desktop and mobile browser screenshots.
7. Compare the desktop render with the concept and record the fidelity ledger.

## Completion evidence

- Prisma Client `6.19.3` generated and the PostgreSQL schema validated.
- Vitest: 7 tests passed.
- Shopify codegen downloaded and generated against the Admin API `2026-07`
  schema; empty F1 document sets are explicitly allowed until F2 adds the
  persisted contract queries.
- ESLint and React Router/TypeScript type checking passed.
- React Router production client/server build passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Shopify CLI `4.5.1` is project-local and authenticated.
- Playwright/Chrome verified `http://127.0.0.1:3000/preview` at 1536x1024
  and 390x844 with zero console errors and no document-level mobile overflow.
- Review remediation QA verified
  `http://127.0.0.1:3000/preview?state=unsynced` at 1440x900 and 390x844:
  the safety state was visible, fixture/reconciled/action content was absent,
  mobile document width matched the viewport, and the console was clean.
- Interaction path passed: load -> overdue filter (8 to 5 rows) -> select Silk &
  Stone Spa -> pause automation -> visible `Automation paused` state.

## Fidelity ledger

| Comparison | Evidence | Result |
|---|---|---|
| Information hierarchy | Heading, sync state, summaries, aging, filters, queue, detail rail | Matched |
| Palette and typography | White/cool-gray surfaces, green success/action, amber attention, Inter | Matched |
| Container model | Open summary bands, primary table, single detail rail | Matched |
| Selected state and actions | Blue row outline, detail update, four collection actions | Matched |
| Responsive behavior | Rail stacks below table; table scroll stays inside its container | Matched |
| Outer Shopify Admin chrome | Present only in concept | Intentional: Shopify supplies this outside the embedded app iframe |
| Preview label | Present only on `/preview` | Intentional: distinguishes sample data; absent from persisted product state |
| Authenticated pre-sync state | Not present in the visual concept | Intentional: financial fixtures are hidden until real synchronization and reconciliation exist |

No material visual mismatch remains for the F1 surface.
