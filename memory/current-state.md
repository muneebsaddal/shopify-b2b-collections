# Current State

**Updated:** 2026-07-20

The B2B A/R Collections Assistant has been selected as the first Shopify app.
The recommended product decisions, requirements, and PRD are approved, with
beauty wholesalers as the first niche. The architecture package was approved
on 2026-07-15: modular monolith plus worker, PostgreSQL and
`pg-boss`, Shopify as receivable truth, Postmark from an app-managed domain,
Shopify App Pricing, Render as the pilot reference deployment, and Level-2
protected-data access limited to buyer email. The Shopify scope/field contract,
data model, threat model, failure behavior, diagrams, and seven ADRs are
documented. The official Shopify React Router TypeScript template has been
scaffolded and platform-foundation task F1 is complete.

Active task: F2. The CLI project is linked and a Basic development preview is
ready. The next gate is to create synthetic B2B fixtures and execute the live
GraphQL/protected-data proof.

## F2 start checkpoint

**Started:** 2026-07-19

- F1 is complete and explicitly approved by the product owner.
- F2-a is complete: organization access is resolved and the CLI project is
  linked to `B2B AR Collections Assistant`. The client ID is present in the
  local Shopify configuration and is not duplicated into evidence files.
- Linking initially replaced the approved scopes with an empty set and changed
  the webhook API version to `2026-10`. The configuration was restored to
  exactly `read_orders`, `read_all_orders`, `read_payment_terms`, and
  `read_customers` with webhook API `2026-07`; CLI validation reports zero
  errors and the three least-privilege contract tests pass.
- The `b2b-ar-f2-basic` store was created with generated test data. Shopify CLI
  localhost preview is ready and auto-granted exactly the four approved scopes.
  Localhost mode cannot receive Shopify webhooks, so F2-e still needs a public
  tunnel after the GraphQL proof.
- The live `F2ShopInstallationContract` query passed without errors: shop
  identity and IANA timezone were present, and exactly the four approved scope
  handles were returned. Raw identifiers and response payloads were not stored.
- The live company/location/contact query also passed without errors. The Basic
  store returned companies and locations, one contact/customer with the
  email-only protected field present, and another company with no contacts.
  Raw identities, exact counts, email values, and payloads were not stored. A
  null/redacted-email contact fixture remains pending.
- The `standard-current-net-terms` fixture is proved on Basic. Its live order
  contract returned unpaid/current state, a positive outstanding balance,
  distinct shop/presentment Money currencies without combining them, a complete
  non-due Net 30 schedule, B2B
  ownership links, and empty refunds/transactions. IDs, amounts, and raw
  payloads were not stored.
- The same response proves the multi-currency fixture and recorded query cost
  requested 15 / actual 11 with restore rate 100. The corrected overdue-order
  query also passed: payment-pending/unpaid, positive outstanding balance,
  due/overdue schedule with null completion, B2B links present, and empty
  refunds/transactions. Pasted customer data and raw identifiers were not
  copied into project evidence.
- Local F2 preparation has started without claiming external proof. Narrow
  Shopify API `2026-07` contract documents and least-privilege tests live under
  `app/platform/shopify/contracts/`.
- `docs/evidence/f2/` defines the sanitized evidence ledger and synthetic
  standard-plan/Plus compatibility fixture matrix. Tokens, HMAC values, buyer
  email, raw webhooks, protected response payloads, and Shopify resource IDs
  must not be committed.
- Local F2 schema proof passed: four narrow GraphQL operations generated types
  against Shopify API `2026-07`; 10 tests, lint, typecheck, Prisma validation,
  and the production build pass. This does not substitute for real-store proof.
- The next safe action is to open Shopify GraphiQL, run the installation and
  company/contact contract queries, then create the synthetic net-term fixture
  matrix. Do not copy buyer email or protected response payloads into evidence.

## F2 pause handoff

**Paused:** 2026-07-20 at user request

- Resume parent task F2; do not begin F3.
- Proved on `b2b-ar-f2-basic`: linked installation, exact four granted scopes,
  shop identity/timezone presence, company/location/contact reads, email-only
  protected-field presence, current Net 30 receivable, multi-currency MoneyBag
  behavior, and overdue unpaid receivable.
- The current-order GraphQL contract measured requested cost 15, actual cost 11,
  and restore rate 100. No raw payload, Shopify resource ID, buyer identity,
  email, address, phone, or exact amount is retained in project evidence.
- Shopify CLI localhost preview was used. It cannot prove webhook delivery; a
  public tunnel remains required for F2-e.
- Immediate next action: create `F2-STANDARD-PAID`, disable customer
  notifications, mark it paid with a manual test method, run
  `F2ReceivableOrderContract`, and verify `PAID`, `unpaid: false`, zero
  outstanding, positive received balance, completed schedule, B2B links, and
  transaction presence.
- After paid/zero: prove refunded, cancelled, edited, missing-email/null behavior,
  Plus partial payment, webhooks/cost budgets, offline-token rotation, and App
  Pricing states. F2 remains in progress and is not approved or complete.

## Integrity review checkpoint

**Reviewed:** 2026-07-14, after context compaction
**Baseline reviewed:** commit `24fa766`

- Confirmed the app is a separate clean Git repository and contains planning
  documentation only: no application scaffold or production code.
- Confirmed requirements and PRD are approved while architecture and all seven
  ADRs remain proposed for the next explicit gate.
- Confirmed the context/container/interface, data ownership, failure/recovery,
  scaling, deployment, security, privacy, and retention sections required by
  the architecture workflow are present.
- Rechecked local Markdown links, code fences, Git whitespace, file references,
  three diagrams, seven ADRs, and app/root memory routing.
- Re-verified the minimum Shopify scope direction and payment-schedule fields
  against current official documentation.
- Recorded that core Shopify B2B companies and net terms are available across
  standard plans, while deposits and advanced partial-payment behavior are
  Plus-only; the core MVP must remain non-Plus-compatible.
- Recorded the current Partner API `activeSubscription` release-candidate status
  as an implementation-time verification gate.

No blocking inconsistency was found. The remaining unknowns are intentionally
gated: real B2B development-store scope/field tests, stable App Pricing
subscription verification, Render region/budget, and Postmark domain proof.

## Architecture approval checkpoint

**Approved:** 2026-07-15

- Architecture, data model, threat model, privacy direction, and all seven ADRs
  are accepted.
- `docs/tasks.md`, project context, and the active implementation plan define
  the implementation sequence.
- The first UI concept is stored at
  `docs/design/todays-collections-concept.png`.
- Shopify CLI authentication is complete for account
  `84699092-b4f2-4146-8e57-631d70cdd6a2`; organization/app linking is pending
  because the API currently returns an empty organization list.
- F1 validation passed: Prisma schema, 3 unit tests, ESLint, TypeScript,
  production build, zero-vulnerability npm audit, and desktop/mobile Playwright
  QA with a clean console.

## F1 review remediation checkpoint

**Resolved:** 2026-07-15

- The authenticated `/app` route now shows a clearly labeled unsynchronized
  onboarding state with no balances or collection actions. Fixture financial
  data is imported only by the explicitly labeled `/preview` route.
- GraphQL code generation now uses `ApiVersion.July26`, matching the runtime
  and webhook configuration target of `2026-07`; schema download and generation
  succeeded against that version.
- Production process startup no longer applies database migrations. Prisma
  Client is generated while building the image, and `npm run release:migrate`
  is the separate gated migration command.
- Regression coverage locks all three review contracts; the updated F1 suite
  contains 7 passing tests, and test, lint, typecheck, Prisma validation, and
  production build all pass.
- Playwright/Chrome visual QA passed for the unsynced state at 1440x900 and
  390x844 with no fixture/reconciled/action content, no mobile overflow, and a
  clean console.
