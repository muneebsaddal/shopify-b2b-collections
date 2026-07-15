# Project Context

## Product

B2B A/R Collections Assistant is a public embedded Shopify app for beauty
wholesalers. It provides trustworthy receivable aging, a daily collections
queue, notes/promises, and safe reminder automation without becoming an
accounting ledger or moving money.

## Stack

- Shopify official React Router TypeScript template
- React 18, React Router 7, App Bridge, Polaris web components
- Node.js web and worker processes from one modular monolith
- PostgreSQL, Prisma, and `pg-boss`
- Shopify GraphQL Admin API `2026-07`
- Postmark, Shopify App Pricing, and Render at later gated tasks

## Commands

- `npm run dev` - linked Shopify development session
- `npm run dev:preview` - local no-auth UI preview
- `npm test` - unit tests
- `npm run lint` - ESLint
- `npm run typecheck` - route types plus TypeScript
- `npm run prisma:validate` - Prisma generation and schema validation
- `npm run build` - production bundle

## Current work

Task F1 in `docs/tasks.md`. Shopify CLI authentication is complete, but a Dev
Dashboard organization/app and B2B development store still need to be created
or made visible before F2 can start.
