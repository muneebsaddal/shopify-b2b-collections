# Active Implementation Plan

**Task:** F1 - Scaffold and validate the application foundation
**Status:** Complete
**Started:** 2026-07-15

## Files and responsibilities

- Root configuration: package scripts, TypeScript, lint, environment example,
  Docker, Shopify application configuration, and CI.
- `app/shopify.server.ts`: Shopify authentication, API version, scopes, and
  PostgreSQL-backed session adapter.
- `prisma/schema.prisma`: PostgreSQL session persistence only for this slice;
  domain tables arrive in F3 after development-store proof.
- `app/features/collections/`: reusable dashboard data, view, styles, and tests.
- `app/routes/app._index.tsx`: authenticated embedded entry point.
- `app/routes/preview.tsx`: development-only no-auth rendering for visual QA.

## Risks and controls

- Shopify account state: local test/build must not require credentials; linking
  is isolated in F2.
- API drift: target the approved `2026-07` version and verify the installed
  package enum during type checking.
- False product behavior: sample dashboard data is labeled as preview data and
  remains separate from persistence and Shopify queries.
- Premature schema commitment: implement only the template-compatible session
  table in F1; introduce approved domain tables with integration tests in F3.
- Visual drift: implement from `docs/design/todays-collections-concept.png` and
  compare native desktop plus mobile screenshots before completion.

## Verification

1. Install from the committed npm lockfile.
2. Generate and validate the Prisma client against PostgreSQL schema syntax.
3. Run unit tests for dashboard filtering, currency grouping, and queue order.
4. Run ESLint and React Router/TypeScript type checking.
5. Build the production server/client bundles.
6. Run the no-auth preview and inspect desktop and mobile browser screenshots.
7. Compare the desktop render with the concept and record the fidelity ledger.

## Completion evidence

- Prisma Client `6.19.3` generated and the PostgreSQL schema validated.
- Vitest: 3 tests passed.
- ESLint and React Router/TypeScript type checking passed.
- React Router production client/server build passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Shopify CLI `4.5.1` is project-local and authenticated.
- Playwright/Chrome verified `http://127.0.0.1:3000/preview` at 1536x1024
  and 390x844 with zero console errors and no document-level mobile overflow.
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

No material visual mismatch remains for the F1 surface.
