# Phase 8: Durable jobs and notifications

Status: local slice complete.

## Shipped

- JSON metadata storage for projects, sessions, approvals, artifacts, audit records, jobs, and notifications.
- Atomic, queued metadata writes.
- File metadata and uploaded content survive API restart.
- Jobs are created for streamed work and remain active when the browser disconnects.
- Jobs enter a bounded in-process queue with configurable concurrency through
  `FLANC_MAX_CONCURRENT_JOBS`.
- Queued jobs can be canceled before they start.
- Jobs retain the full prompt needed for recovery.
- Explicit stop and cancel endpoints update job state.
- Restarted queued or running jobs become `paused` and create a notification.
- Failed, paused, or canceled jobs can be retried; finished jobs can be duplicated.
- Browser reconnect now calls Hermes `session.resume` and restores returned history.
- Reconnect can replay up to 256 normalized events from the durable API-side
  run ledger by cursor, without duplicating already received events.
- API routes for jobs, notifications, read state, cancellation, retry, and duplication.
- Browser notifications with permission-aware delivery and five-second refresh.
- Browser diagnostics panel backed by the persisted audit log.
- ntfy and Apprise adapters behind environment configuration.
- Short-lived, single-use approval links with a mobile-friendly review page.
- Approval review logic runs from a CSP-allowed external script, shows the exact
  safe action target, and hides decision controls after use.

## Evidence

- `npm run check`: 442 tests passed; lint, typecheck, and build passed.
- `npm run test:e2e`: 13 Chromium tests passed, including mobile approval review
  and single-use token replay protection.
- Manual restart test: a created project and uploaded `notes.txt` were present after stopping and restarting the API with the same storage root.

## Boundaries

This is the local durable slice. It is not yet PostgreSQL-backed or multi-worker;
the queue is process-local. Browser reconnect restores Hermes session history
and replays the durable bounded event ledger, but Hermes run reattachment still
needs the production worker contract. Retry and duplication start a new Hermes
run; they do not resume the old run. Approval links are signed bearer
capabilities; full user authentication remains a hosting hardening task.
