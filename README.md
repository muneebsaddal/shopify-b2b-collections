# B2B A/R Collections Assistant

Working product concept for a public embedded Shopify app.

**Promise:** Get Shopify wholesale invoices paid without spreadsheets or
manual chasing.

**Current status:** Requirements and PRD approved. Architecture, Shopify
integration design, data model, threat model, and ADRs are documented for
review. No application code has been scaffolded.

## Planning documents

- `docs/project_plan.md` - initial product, system, delivery, and launch plan
- `docs/development_workflow_analysis.md` - assessment and Shopify-specific
  adaptation of the workspace development workflow
- `docs/architecture/ARCHITECTURE.md` - approved-direction system design and
  architecture review gate
- `docs/architecture/shopify-integration.md` - verified API, scopes, fields,
  webhooks, authentication, and billing contract
- `docs/architecture/data-model.md` - tenant-aware logical data model
- `docs/architecture/threat-model.md` - security and privacy threat model
- `docs/architecture/adrs/` - individual architecture decisions
- `DEVELOPMENT_WORKFLOW.md` - operating workflow for this app
- `memory/current-state.md` - concise handoff and next-action state

## Source research

The opportunity research remains at
`../shopify_app_opportunity_research.md`.

## Next gate

Review the architecture package. After approval, decompose the MVP into small
implementation tasks and scaffold the official Shopify React Router app.
