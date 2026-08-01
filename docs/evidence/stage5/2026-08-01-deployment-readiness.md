# Stage 5 deployment readiness — 2026-08-01

## Result

The repository is prepared for the development/staging deployment slice, but
no live environment has been provisioned from this workspace. Stage 5 remains
in progress and pilot traffic is not authorized.

## Implemented deployment controls

- Added a Render staging Blueprint for one web service, one worker, and one
  private PostgreSQL 18 database in Singapore.
- Selected a US$75/month staging/pilot ceiling and paid baseline tiers; the
  provider checkout estimate must be approved before resource creation.
- Added a multi-stage, non-root production container. The runtime now retains
  `tsx`, which is required by the worker command and was previously omitted by
  `npm ci --omit=dev`.
- Added a no-secret environment preflight, exact Shopify scope check, HTTPS and
  private-PostgreSQL checks, isolated Postmark stream requirement, distinct
  encryption/tombstone keys, and immutable Git SHA release identity.
- Added a gated web migration command and a worker migration-status gate.
- Added release-aware liveness/readiness, public route, and fail-closed webhook
  smoke checks.
- Added an explicitly targeted isolated-restore command that replays deletion
  tombstones and fails if any restored protected-data conflict remains.
- Added an audited global safety-control command for pause/rollback handling.
- Added the provisioning, Postmark, Shopify, alerts, restore, rollback, and
  evidence procedure in `docs/deployment/staging-runbook.md`.

## Local proof

| Check                          | Result                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                     | Pass: 20 files, 71 tests, including 11 PostgreSQL integration checks                                                     |
| `npm run lint`                 | Pass                                                                                                                     |
| `npm run typecheck`            | Pass                                                                                                                     |
| `npm run prisma:validate`      | Pass                                                                                                                     |
| `npm run build`                | Pass                                                                                                                     |
| Prettier YAML/Markdown parse   | Pass                                                                                                                     |
| `git diff --check`             | Pass                                                                                                                     |
| Docker production build        | Pass                                                                                                                     |
| Final-image runtime inspection | Pass: non-root `node` user; `tsx`, `react-router-serve`, Prisma CLI, worker source, migrations, and server build present |

The final local manifest ID after pinning the Node base-image digest was
`sha256:ae7272c6bd03e36a6d515fc100fbfd3e47b22ec5e9b07125706bef0a09e70f31`.
It is local evidence only, not a deployed or registry-retained release digest.

`npm audit --omit=dev --audit-level=high` still reports the documented React
Router RSC-only advisory chain. This application does not enable the unstable
RSC APIs; npm still proposes the inappropriate forced 7.11.0 downgrade rather
than a patched React Router 7 release. No automatic downgrade was applied.

Post-publication GitHub Actions exposed that the PostgreSQL privacy integration
file inherited its tombstone key from the local `.env`. The test now generates
and restores its own synthetic 32-byte key. All 71 tests pass with both privacy
and session keys absent from the parent process, matching the CI environment.

Live provider results are never inferred from local fixtures.

## Live gates still open

- The reviewed release is published to the private GitHub repository, but this
  workspace has no Render, Shopify, or Postmark deployment session, so no live
  infrastructure or provider resource was created.
- Render CLI/API semantic Blueprint validation and provider checkout approval
- isolated staging web, worker, PostgreSQL, secrets, and monitoring resources
- gated migration and immutable deployed release SHA
- durable Shopify webhook endpoint and authenticated embedded journeys
- protected customer data and `read_all_orders` approval/proof
- live App Pricing states and hosted redirects
- live Postmark domain, reply-to, webhook, bounce/complaint, and ambiguity proof
- alert delivery and incident tabletop
- actual backup creation, isolated restore, tombstone replay, and rollback

Safe state: new shops start with reminder automation paused; missing billing or
provider truth fails closed; the worker is not auto-deployed before the web
migration; and a restored database is barred from traffic until deletion replay
and privacy verification succeed.
