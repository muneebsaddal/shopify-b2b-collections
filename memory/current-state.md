# Current State

**Updated:** 2026-07-26

The B2B A/R Collections Assistant requirements, PRD, architecture, data model,
threat model, ADRs, and first UI direction are approved. The official Shopify
React Router TypeScript application is scaffolded, linked to a development app,
and configured for Shopify API `2026-07` with the four approved read scopes.

The old multi-document planning and gate system was retired at the product
owner's direction. `docs/plan.md` is now the single delivery plan:

```text
Requirements gathering → Planning → Development → Testing → Deployment
```

Requirements gathering and planning are complete. Development is active.

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

## Immediate development work

Start D1 — Core platform runtime:

1. Add tenant-aware shop and lifecycle persistence to Prisma.
2. Add shop-scoped repository boundaries and constraints.
3. Implement safe install, scope-change, uninstall, reinstall, and inactive-shop
   behavior.
4. Add audit records and protected-data-access records.
5. Add `pg-boss`, worker entry point, typed durable jobs, safe logging, and
   health endpoints.

Do not resume the old F2 gate. The next work is implementation.
