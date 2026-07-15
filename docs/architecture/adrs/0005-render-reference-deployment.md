# ADR 0005: Render as the pilot reference deployment

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

The pilot needs a continuously available web service, background worker,
managed PostgreSQL, private networking, backups, TLS, health checks and simple
container deployment. Technical scalability is less important than low
operational burden during validation.

## Decision

Deploy the pilot on Render: one web service, one background worker and managed
PostgreSQL in the same selected region. Use containers and standard PostgreSQL
so the deployment remains portable. Keep development, preview and production
accounts/data separate.

## Consequences

- A solo builder can deploy and observe the complete stack with little platform
  engineering.
- Region selection, cost ceiling and backup tier must be approved before real
  merchant data.
- Render is a provider dependency but not a domain dependency.
- Reassess after pilots if residency, reliability, scale or cost evidence
  conflicts with this choice.

## Alternatives rejected

- **AWS/GCP primitives:** maximum control, higher initial operating surface.
- **Vercel plus separate worker platform:** good web DX, fragmented runtime.
- **Self-hosted VM:** unnecessary patching, failover and backup responsibility.

## Reference

- [Render background workers](https://render.com/docs/background-workers)
