# Stage 5 staging deployment runbook

**Scope:** development/staging deployment only. Controlled-pilot and public-
release work starts only after every live gate in this runbook has evidence.

## Approved staging shape

- Render region: `singapore`. This is the closest current Render region to the
  operator and keeps web, worker, and PostgreSQL on one private regional
  network. Reassess residency before creating production because Render regions
  cannot be changed in place.
- Recurring staging/pilot ceiling: **US$75/month** across Render, Postmark, and
  monitoring. Stop before provisioning if the provider checkout estimate is
  above the ceiling.
- Render resources: one Starter web service, one Starter worker, and one paid
  Basic 256 MB PostgreSQL 18 instance with 15 GB storage.
- PostgreSQL has no public IP allowlist. Web and worker use its private direct
  connection because `pg-boss` shares the database and must not use a
  transaction-pooling boundary.
- Web and worker are stateless. No persistent service disk or object store is
  provisioned because the MVP does not persist generated statement files.
- Staging uses a separate Shopify app, Postmark server/message stream, database,
  encryption keys, tombstone key, and alert destinations. Production resources
  must not reuse them.

The infrastructure contract is [`render.yaml`](../../render.yaml). Render's
current Blueprint reference is https://render.com/docs/blueprint-spec.

## Prerequisites

1. Push the reviewed commit to a connected private Git repository. Record its
   full Git SHA; that exact SHA is `RELEASE_VERSION`.
2. Create or select a staging Shopify public app and staging development store.
3. Create a staging Postmark server and the transactional message stream
   `b2b-ar-staging`. Verify the app-managed sender domain/address.
4. Configure Render workspace MFA, least-privilege operator access, deployment
   failure notifications, and the US$75 budget alerts before adding pilot data.
5. Ensure CI passes for the release commit. Do not deploy from a dirty local
   worktree.

## Secret entry

Render prompts for the `sync: false` values on the web service. Never paste
them into Git, logs, tickets, or this runbook.

- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`
- `SHOPIFY_PARTNER_ORGANIZATION_ID`, `SHOPIFY_PARTNER_ACCESS_TOKEN`,
  `SHOPIFY_PARTNER_APP_GID`, `SHOPIFY_APP_HANDLE`
- `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL`
- `RELEASE_VERSION` (the full release commit SHA)

Render generates the session-encryption, privacy-tombstone, and Postmark
webhook secrets. The worker references the web service's values so both
processes use exactly the same key material. Store a recoverable copy of the
encryption and tombstone keys in the approved secret manager; losing them makes
protected data or restore verification unrecoverable.

Set `SHOPIFY_APP_URL` to the final HTTPS origin, normally
`https://b2b-ar-collections-staging-web.onrender.com`. If Render assigns another
host, update the value and redeploy before configuring Shopify.

## First release

1. Create the Render Blueprint from `render.yaml` and confirm the cost estimate
   is within the approved ceiling.
2. Deploy the web service first. Its pre-deploy gate validates the environment
   without printing secret values, then runs `prisma migrate deploy` once.
3. Confirm `/healthz` and `/readyz` return the expected release SHA.
4. Deploy the worker manually after the web migration succeeds. Its pre-deploy
   command fails closed if migrations are pending. Confirm one `worker.ready`
   structured log for the expected release.
5. Run:

   ```powershell
   npm run deployment:smoke -- https://b2b-ar-collections-staging-web.onrender.com <full-git-sha>
   ```

6. Link the staging Shopify app configuration. Set `application_url` and the
   auth callback to the same HTTPS origin, deploy that configuration with
   Shopify CLI, and install only on the approved staging store. Do not replace
   the development app configuration.
7. Configure the staging Postmark webhook at
   `<SHOPIFY_APP_URL>/webhooks/postmark`. Add the custom header
   `x-postmark-webhook-token` with Render's generated value. Enable Delivery,
   Bounce, SpamComplaint, and SubscriptionChange for `b2b-ar-staging`; keep
   content inclusion disabled.
8. Re-run the smoke check, then complete authenticated Shopify and real
   Postmark checks in the Stage 5 evidence record.

Shopify requires the deployed app URL and environment variables to agree:
https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service.
Postmark webhook configuration supports custom HTTP headers and per-stream
triggers: https://postmarkapp.com/developer/api/webhooks-api.

## Monitoring and alerts

Route alerts to the on-call operator and verify receipt with a test alert.

- Render: failed deploy, unhealthy web service, worker exit/restart, database
  resource saturation, and PostgreSQL recovery events.
- Structured logs: `jobs.queue_error`, `worker.job_failed`,
  `worker.reconciliation_request_failed`, and any 503 from `/readyz`.
- Merchant diagnostics during staging: failed sync/webhooks, token expiry,
  stale billing, `UNKNOWN` delivery, failed delivery, and overdue privacy work.
- Postmark: hard-bounce and complaint rate, suppression events, and stream
  inactivity after an expected send.

Logs and alert payloads may contain only the existing allowlisted operational
fields. Never attach tokens, email addresses, HMAC values, webhook bodies, or
message content.

## Backup and isolated restore gate

No restored database may serve web or worker traffic until this gate passes.

1. Create a Render logical backup or point-in-time recovery from staging.
2. Restore it to a new PostgreSQL instance with no web or worker attached and
   no public IP access.
3. Set the restored instance's `DATABASE_URL`, the original
   `PRIVACY_TOMBSTONE_KEY`, and the exact expected restored host/database name.
4. Apply migrations, then explicitly run:

   ```powershell
   $env:RESTORE_VERIFICATION='REPLAY_DELETION_TOMBSTONES_ON_ISOLATED_RESTORE'
   $env:RESTORE_DATABASE_EXPECTED_HOST='<exact-private-restore-host>'
   $env:RESTORE_DATABASE_EXPECTED_NAME='<exact-restore-database>'
   npm run privacy:replay-tombstones
   ```

5. Require zero remaining deletion-tombstone conflicts, run the PostgreSQL
   integration campaign against the isolated database, and record counts only.
6. Delete the isolated restore after evidence is captured. Do not repoint
   staging traffic to it.

Render paid PostgreSQL recovery and logical-backup behavior is documented at
https://render.com/docs/postgresql-backups.

## Pause, rollback, and resume

Before rollback, globally block new reminder submissions with an audited
operator action:

```powershell
$env:OPERATOR_CONFIRMATION='CONFIRM'
$env:OPERATOR_ID='<operator-id>'
npm run operations:global-control -- REMINDER_SENDS block release_rollback
```

Keep provider webhooks enabled so accepted messages can reach terminal delivery
state. Roll back the web and worker to the same last-known-good Render deploy,
confirm that its schema is forward-compatible, run the smoke check with that
release SHA, and inspect `UNKNOWN` deliveries before resuming. Unblock sends
only with a new audited command after Shopify freshness, billing truth,
Postmark, and alert routing are healthy.

Render rollback behavior is documented at https://render.com/docs/rollbacks.

## Exit evidence for this slice

- Blueprint provision IDs and provider cost estimate
- release SHA and successful gated migration log
- liveness/readiness and deployment-smoke output
- `worker.ready` log and queue/dead-letter inspection
- Shopify authenticated embedded flow and durable webhook delivery
- Postmark delivery, bounce/complaint, suppression, and authenticated ingress
- alert receipt/tabletop record
- isolated backup restore, tombstone replay, privacy verification, and image
  rollback evidence

Until all items exist, Stage 5 remains in progress and no pilot traffic is
authorized.
