# ADR 0001: Modular monolith with separate web and worker processes

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

The pilot is built by one developer but needs an embedded UI, webhook intake,
scheduled/background work, privacy processing and email delivery. Microservices
would add deployment, contracts and distributed failure modes before there is
evidence they are needed.

## Decision

Use one TypeScript codebase with domain modules and provider ports. Build one
immutable image and run it as a stateless web process and a separately scalable
worker process. Modules own their data access and communicate through typed
application services or internal events.

## Consequences

- Local development, tests, migrations and releases remain simple.
- Background load can scale independently from web traffic.
- Boundaries depend on import rules and review rather than network isolation.
- A future service extraction is possible at a measured module boundary.

## Alternatives rejected

- **Microservices:** excessive operating and consistency cost for the pilot.
- **Web process only:** unsafe for webhook deadlines and scheduled/retry work.
- **Serverless functions only:** possible, but long imports, job control and
  provider ambiguity are clearer in a persistent worker model.
