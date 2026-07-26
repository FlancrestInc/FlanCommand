# Phase 13: State-changing origin policy

Status: initial request-origin protection complete.

## Completed

- Added an exact-match allowlist for state-changing API request origins.
- Kept local same-origin development working when the list is blank.
- Rejected untrusted `Origin` values before request bodies or mutations are processed.
- Applied the same check to preflight requests.
- Removed wildcard CORS headers from chat and terminal SSE streams.
- Added API and unit coverage for allowed, rejected, blank, and malformed-origin-list cases.
- Added an opt-in trusted-identity guard for Cloudflare Access deployments.
- Protected browser and API routes return an actionable `AUTH_REQUIRED` error;
  health checks remain available to the deployment monitor.
- `npm run check`: 411 tests passed; lint, typecheck, and build passed.
- Added per-client rate limits for uploads, runs, approvals, terminals,
  credentials, and policy evaluation with `429` and `Retry-After` responses.
- Added checksum-verified storage snapshots for metadata and uploads, with
  restore-by-swap and rollback retention of the replaced storage root.
- Added the `storage:backup` CLI and local recovery instructions.
- Added authenticated `/api/metrics` JSON output with request counts, status
  counts, latency, sessions, jobs, notifications, and artifact totals.
- Health checks now return safe component status and HTTP 503 when the runtime
  cannot connect, instead of a generic 500 response.

## Current evidence

- `npm run check`: 438 tests passed; lint, typecheck, and build passed.
- The built backup CLI passed a snapshot, mutation, restore, and rollback test
  with both metadata and uploaded content.
- API coverage verifies the metrics endpoint reports current runtime state.
- API coverage verifies healthy and degraded health responses.

## Configuration

Set `FLANC_ALLOWED_ORIGINS` to comma-separated exact HTTPS origins in deployment. This is a CSRF defense layer; Cloudflare Access still provides the authenticated user boundary.

Set `FLANC_REQUIRE_AUTH=true` to enforce the Access identity header at the
application boundary. The default header is
`Cf-Access-Authenticated-User-Email`; use `FLANC_AUTH_IDENTITY_HEADER` only
when a trusted reverse proxy provides a different identity header.

## Boundaries

The limiter is in-memory and process-local. Multi-worker deployments need a
shared edge or datastore-backed limiter. Secure cookie configuration remains
production-hardening work.
