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
