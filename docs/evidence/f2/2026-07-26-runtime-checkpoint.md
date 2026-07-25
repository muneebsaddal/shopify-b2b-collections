# F2 Runtime Prerequisite Checkpoint

**Date:** 2026-07-26
**Status:** External proof remains

This checkpoint contains sanitized capability observations only. It does not
retain session IDs, shop domains, access or refresh tokens, token hashes,
GraphQL response payloads, Shopify resource IDs, protected values, or exact
financial data.

## Signed webhook retry

The corrected database-backed preview was exposed through the temporary HTTP/2
tunnel. Shopify CLI accepted and enqueued another signed
`app/scopes_update` sample. The handler did not observe the sample during a
45-second window and no handler error marker appeared. Authentic webhook
delivery remains unproved.

## Expiring offline-session metadata

An isolated local PostgreSQL container was created for synthetic development
sessions because the installed Windows PostgreSQL service required an unknown
password. No database credential was persisted in the repository or an
environment file.

After opening the embedded app, exactly one offline session was persisted. It
contained:

- an access-token expiry;
- a refresh token;
- a refresh-token expiry.

The access expiry was moved into the past to exercise automatic refresh.
Browser requests opened from the agent environment did not reach the
authenticated app route, so the persisted expiry did not advance and live
rotation was not claimed. The local expiry was restored to a short future
window without changing either token value.

Live rotation and concurrent refresh require an authenticated browser request
that reaches the running embedded app while the persisted access expiry is in
the past.

## Store capability

A narrow Admin API `2026-07` capability query confirmed that the installed
development store is a Basic app-development store and is not Shopify Plus.
The store can prove the standard-plan core contract but cannot prove the
Plus-only partial-payment scenario.

Plus compatibility therefore requires a separate Plus sandbox or development
store. No Plus behavior is inferred from the Basic fixture.

Negative-outstanding behavior also remains pending because no safe supported
workflow for creating that authoritative Shopify state has been proved.

## Shopify App Pricing

Runtime App Pricing proof remains pending. It requires:

- a Partner API client with Manage-apps permission;
- the public app and shop identifiers used only at request time;
- a configured $0 private test plan;
- active, frozen, cancelled, and downgrade/test transitions.

The agent did not create an API client, request a credential, configure a plan,
or claim runtime subscription proof.
