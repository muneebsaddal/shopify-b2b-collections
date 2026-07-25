# F2 Shopify Contract Proof

**Status:** In progress
**Started:** 2026-07-19
**Evidence rule:** Never store access tokens, HMAC values, buyer email addresses,
raw webhook bodies, or protected customer payloads in this directory.

This directory is the evidence index for task F2. A local schema/code-generation
pass proves only that a document matches Shopify API `2026-07`; it does not prove
scope approval, store capability, runtime values, webhook delivery, token
rotation, or billing state.

**Pause handoff:** Paused 2026-07-20 at the user's request. Resume with the
`F2-STANDARD-PAID` fixture to combine paid-state and zero-outstanding proof.

## Package status

| Package | State | Evidence or blocker |
|---|---|---|
| F2-a organization/app linkage | `COMPLETE` | On 2026-07-19, the existing CLI project was linked to `B2B AR Collections Assistant`. The client ID is present but intentionally not copied into evidence. CLI validation passes with zero configuration errors. |
| F2-b fixture matrix | `BASIC_STORE_READY` | The `b2b-ar-f2-basic` development store was created with generated test data and selected for the dev preview on 2026-07-19. Synthetic B2B scenario creation remains pending. See [`fixture-matrix.md`](fixture-matrix.md). |
| F2-c scopes/protected data | `SCOPE_QUERY_PROVED` | On 2026-07-19, `F2ShopInstallationContract` succeeded on the Basic store: shop identity and IANA timezone were present, and the installation returned exactly `read_orders`, `read_all_orders`, `read_payment_terms`, and `read_customers`. Raw shop ID was not recorded. A live query must still prove email-only protected-field behavior, including a missing-email case. |
| F2-d GraphQL documents | `BASIC_RUNTIME_IN_PROGRESS` | Four typed operations passed Shopify API `2026-07` code generation. Installation, company/contact, and current Net 30 receivable operations have passed live on Basic. Remaining state fixtures and response costs are pending. |
| F2-e webhooks/costs | `PENDING_EXTERNAL_PROOF` | Record redacted topic support, delivery, duplicate/reversed replay, and cost/throttle observations after installation. |
| F2-f token/compatibility | `PENDING_EXTERNAL_PROOF` | Requires an installed public development app and both standard-plan and Plus-compatible scenarios. |
| F2-g App Pricing | `PENDING_EXTERNAL_PROOF` | Requires the linked app and supported Partner/App Pricing surface. |

## Redacted evidence to capture

- UTC timestamp, API version, operation/topic name, outcome, and relevant
  capability state.
- GraphQL requested/actual cost and throttle status without response payloads.
- Stable scenario labels such as `overdue-unpaid` rather than Shopify resource
  IDs or buyer identity.
- Hashes or sanitized excerpts only when they cannot expose protected data.

F2 is not complete until every development-store checklist item in
`docs/architecture/shopify-integration.md` is evidenced or recorded as a named
blocker and reviewed without an unresolved external proof item.

## Local validation checkpoint - 2026-07-19

- App linkage: passed; organization access is resolved and the linked client ID
  is present without being duplicated in this evidence file.
- Linked configuration correction: the dashboard defaults initially cleared
  scopes and selected webhook API `2026-10`; local configuration was restored to
  exactly the approved four read scopes and API `2026-07`, then revalidated.
- Basic dev preview: ready through localhost networking; Shopify reported that
  all four approved scopes were auto-granted. Localhost mode cannot prove
  webhook delivery, so F2-e still requires a public tunnel.
- Live installation contract: passed without GraphQL errors; shop identity and
  IANA timezone were present and the granted-scope query returned exactly the
  four approved handles. No raw shop ID or response payload was retained.
- Live company contract: passed without GraphQL errors on the Basic store.
  Multiple companies were returned; company locations were present; one
  company had a contact/customer with `defaultEmailAddress` present and another
  had no contacts. Names, IDs, email values, counts, and raw payloads were not
  retained. A contact with a null/redacted email still needs a dedicated
  synthetic fixture.
- Live current Net 30 receivable: passed without GraphQL errors. The order was
  unpaid/current with a positive authoritative outstanding balance; shop and
  presentment Money values preserved their distinct currencies; the Net 30
  schedule was not due or overdue;
  issue/due timestamps were present and completion was null; company, location,
  and contact links were present; refunds and transactions were empty. IDs,
  exact amounts, and the raw payload were not retained.
- Current-order query cost: requested 15, actual 11, restore rate 100. The
  response also proved the Basic multi-currency fixture because shop and
  presentment Money values retained different currency codes without being
  combined.
- Live overdue receivable: passed on the corrected order without GraphQL errors.
  The order was payment-pending/unpaid with a positive outstanding balance; its
  schedule was due and overdue with no completion timestamp; B2B ownership links
  were present; refunds and transactions were empty. No customer identity,
  address, contact data, Shopify resource ID, amount, or raw response was
  retained.
- Shopify API `2026-07` GraphQL code generation: passed; four F2 operations
  generated typed results.
- Vitest: 10 tests passed, including three F2 least-privilege contract tests.
- ESLint: passed.
- TypeScript/React Router typecheck: passed.
- Prisma generate/validate: passed with the documented local validation URL.
- React Router production build: passed.
