# Agent Development Guide

## Required context

Before implementing a task, read `docs/requirements.md`, `docs/prd.md`,
`docs/architecture/ARCHITECTURE.md`, `docs/plan.md`, and the relevant focused
architecture document or ADR.

## Implementation rules

- Work on one active development slice from `docs/plan.md` at a time.
- Preserve Shopify as the source of truth for balances and payment state.
- Scope every persisted query and unique constraint by shop unless a documented
  global identity requires otherwise.
- Treat webhooks as untrusted, duplicated, and out of order.
- Fail closed when reminder eligibility or provider submission is ambiguous.
- Do not log tokens, HMAC values, webhook bodies, buyer email, or protected
  customer payloads.
- Use GraphQL Admin API only and request no scope or field beyond the approved
  Shopify integration contract.
- Keep business rules in focused server/domain modules rather than route files.
- Avoid barrel imports and avoid sequential awaits for independent I/O.

## Completion checks

Keep the application runnable during development and update documentation and
`memory/current-state.md` with material changes. The full test, lint, typecheck,
Prisma validation, and build campaign is performed in Stage 4. Missing external
proof is recorded for Stage 4 or Stage 5 and does not block development when a
safe fallback exists.
