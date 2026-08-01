# F2 Offline-Token Rotation Proof

**Date:** 2026-07-26
**Status:** Passed

This checkpoint contains sanitized behavior only. It does not retain a shop
domain, session ID, access token, refresh token, token digest, browser URL, or
protected payload.

## Single-request rotation

The isolated synthetic PostgreSQL database contained exactly one offline
session with:

- access-token expiry metadata;
- refresh-token material;
- refresh-token expiry metadata.

The access expiry was moved into the past. An authenticated embedded-app load
completed successfully and displayed the expected unsynchronized F1 screen.
The persisted access expiry then advanced to approximately 59 minutes in the
future while the refresh expiry remained valid.

## Concurrent rotation

Temporary token digests were held in tool memory only and were discarded after
comparison. They were never displayed or written to the repository.

The access expiry was moved into the past again. Two authenticated embedded-app
tabs were refreshed together. Both reached the expected unsynchronized screen.
Afterward:

- exactly one offline session remained;
- the access and refresh token digests had both changed;
- the new access expiry was approximately 59 minutes in the future;
- the refresh expiry remained valid;
- the corrected preview logs contained zero session-table or application-error
  markers.

This proves live offline-token rotation and convergence under two concurrent
authenticated requests for the F2 development setup. F3 must still implement
and integration-test the application-owned encrypted persistence and
compare-and-swap lifecycle contract.
