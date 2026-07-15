# ADR 0003: PostgreSQL and pg-boss for durable jobs

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

The app needs durable webhook processing, scheduling, retries, backoff,
dead-letter visibility and transactional enqueue. Adding Redis and a second
durability system would increase pilot operations.

## Decision

Use managed PostgreSQL for application data and `pg-boss` for job execution.
Enqueue jobs in the same transaction as application state where possible.
Handlers remain idempotent and queue access sits behind an internal port.

## Consequences

- One backed-up datastore supports state and jobs.
- Transactional enqueue eliminates a common database/queue split-brain window.
- Queue load competes with application load and requires monitoring/index care.
- A queue migration remains possible through the port if measured throughput or
  isolation demands it.

## Alternatives rejected

- **BullMQ/Redis:** capable but adds a service before it is justified.
- **Hosted workflow platform:** stronger orchestration but more cost, lock-in and
  data-boundary work for a narrow MVP.
- **Database polling built in-house:** recreates leases, retries and scheduling.

## Reference

- [`pg-boss` repository](https://github.com/timgit/pg-boss)
