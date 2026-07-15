# B2B A/R Collections Assistant

Working product concept for a public embedded Shopify app.

**Promise:** Get Shopify wholesale invoices paid without spreadsheets or
manual chasing.

**Current status:** Requirements, PRD, architecture, data model, threat model,
and ADRs are approved. The official Shopify React Router TypeScript foundation
has been scaffolded and the first platform-foundation implementation task is in
progress.

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
- `docs/tasks.md` - ordered, testable MVP implementation backlog
- `docs/implementation_plan.md` - active implementation slice and verification
- `docs/design/` - approved implementation concepts and UI specifications
- `DEVELOPMENT_WORKFLOW.md` - operating workflow for this app
- `memory/current-state.md` - concise handoff and next-action state

## Source research

The opportunity research remains at
`../shopify_app_opportunity_research.md`.

## Local development

Requirements: Node.js 22.12 or newer, npm, PostgreSQL, and a Shopify Partners
organization with an app-capable account.

```powershell
Copy-Item .env.example .env
npm ci
npm run prisma:validate
npm test
npm run dev:preview
```

Open `http://127.0.0.1:3000/preview` for the credential-free dashboard preview.
After a Shopify organization and development store exist, run
`npm run config:link`, then `npm run dev`.

## Active gate

The platform foundation is complete. Create or expose the Shopify Partners
organization, link the app, and prove the selected B2B scopes and fields on a
development store before implementing the receivables projection.
