# Current State

**Updated:** 2026-07-14

The B2B A/R Collections Assistant has been selected as the first Shopify app.
The recommended product decisions, requirements, and PRD are approved, with
beauty wholesalers as the first niche. The architecture package is ready for
review under `docs/architecture/`: modular monolith plus worker, PostgreSQL and
`pg-boss`, Shopify as receivable truth, Postmark from an app-managed domain,
Shopify App Pricing, Render as the pilot reference deployment, and Level-2
protected-data access limited to buyer email. The Shopify scope/field contract,
data model, threat model, failure behavior, diagrams, and seven ADRs are
documented. No application code has been scaffolded.

Next gate: approve or revise the architecture package, prove the selected
Shopify fields/scopes on a B2B development store, then create the implementation
task breakdown before scaffolding.
