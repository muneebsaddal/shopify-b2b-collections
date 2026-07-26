# B2B A/R Collections Assistant

Working product concept for a public embedded Shopify app.

**Promise:** Get Shopify wholesale invoices paid without spreadsheets or
manual chasing.

**Current status:** Requirements and planning are complete. The official
Shopify React Router TypeScript foundation is scaffolded and active development
has begun.

## Project documents

- `docs/plan.md` - the single delivery plan and current development sequence
- `docs/requirements.md` - approved product requirements
- `docs/prd.md` - approved product requirements document
- `docs/architecture/ARCHITECTURE.md` - approved-direction system design and
  architecture review gate
- `docs/architecture/shopify-integration.md` - verified API, scopes, fields,
  webhooks, authentication, and billing contract
- `docs/architecture/data-model.md` - tenant-aware logical data model
- `docs/architecture/threat-model.md` - security and privacy threat model
- `docs/architecture/adrs/` - individual architecture decisions
- `docs/design/` - approved implementation concepts and UI specifications
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
Use `http://127.0.0.1:3000/preview?state=unsynced` to inspect the authenticated
pre-sync presentation without Shopify credentials.
After a Shopify organization and development store exist, run
`npm run config:link`, then `npm run dev`.

## Production release commands

Build the immutable application image, run the schema migration once as a
gated release step, and promote or restart web/worker processes only after that
step succeeds:

```powershell
npm run release:migrate
npm run docker-start
```

`docker-start` never applies migrations. Prisma Client generation happens at
image build time; ordinary container recovery starts only the application
process.

## Current stage

Requirements and planning are complete. Development is active, beginning with
the tenant-aware platform runtime described in `docs/plan.md`.
