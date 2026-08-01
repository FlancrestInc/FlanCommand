# Durable Hermes Sessions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hermes runs independent from browser requests so sessions survive reloads, client changes, and API reconnects while accepting TUI-style steering input.

**Architecture:** The API will own background jobs and publish their normalized events through a bounded per-session event hub. A reconnectable SSE endpoint will send a current session snapshot and future events to any browser. The existing persisted job/session state remains the recovery source after an API restart; Hermes session history supplies missing response text without replaying prompts.

**Tech Stack:** Node.js HTTP server, TypeScript, Hermes adapter, JSON metadata store, browser EventSource, Vitest, Playwright.

---

## File map

- Create: `apps/api/src/session-events.ts` — bounded per-session event hub and replay cursor.
- Create: `apps/api/src/session-events.test.ts` — event hub replay, fan-out, and unsubscribe tests.
- Modify: `apps/api/src/server.ts` — background job ownership, event publication, reconnectable SSE route, and startup recovery.
- Modify: `apps/api/src/app.test.ts` — API tests for detached clients, second-client streams, steering, and restart recovery.
- Create: `apps/web/public/session-events.js` — browser EventSource client with snapshot and agent handlers.
- Create: `apps/web/public/session-events.d.ts` — declarations for the browser module.
- Create: `apps/web/src/session-events.test.ts` — browser event client behavior tests.
- Modify: `apps/web/public/app.js` — subscribe on session open, consume shared events, and allow input during active runs.
- Modify: `apps/web/public/sw.js` — cache the new browser module and bump the shell cache.
- Modify: `apps/web/src/sw.test.ts` — assert the new asset and cache version.
- Modify: `docs/superpowers/specs/2026-08-01-durable-hermes-sessions-design.md` — approved design reference.

## Chunk 1: Event hub and API background ownership

### Task 1: Add the event hub test

**Files:** Create `apps/api/src/session-events.test.ts`.

- [ ] Write a failing test that publishes two events for one session and verifies a subscriber receives both with increasing cursors.
- [ ] Write a failing test that subscribes after a cursor and receives only later events.
- [ ] Write a failing test that unsubscribing stops delivery and that old events are bounded.
- [ ] Run `npm test -- apps/api/src/session-events.test.ts` and confirm it fails because the hub is missing.

### Task 2: Implement the event hub

**Files:** Create `apps/api/src/session-events.ts`.

- [ ] Add typed records containing a numeric cursor and `AgentEvent`.
- [ ] Add bounded per-session history, `publish`, `currentCursor`, `replay`, and `subscribe` methods.
- [ ] Keep subscriber callbacks synchronous and catch callback errors so one closed response cannot break other subscribers.
- [ ] Run the focused event hub test and confirm it passes.

### Task 3: Add API tests for detached background work and live clients

**Files:** Modify `apps/api/src/app.test.ts`.

- [ ] Add a mock adapter stream that pauses after `run.started` and exposes a release function.
- [ ] Test that `POST /messages` returns an accepted job without waiting for the stream to finish.
- [ ] Test that the first response can close while the job completes and the job/session state is persisted.
- [ ] Test that a second `GET /sessions/:id/events` client receives the current snapshot and later agent events.
- [ ] Test that a `/steer` message is accepted while another run is active and is sent to Hermes.
- [ ] Run the focused API tests and confirm the new tests fail against the request-bound implementation.

### Task 4: Decouple API runs from HTTP responses

**Files:** Modify `apps/api/src/server.ts`.

- [ ] Add a server-owned `SessionEventHub` and a helper that records, applies, persists, and publishes each agent event.
- [ ] Remove response ownership from `runJob`; only publish to the hub when a response subscriber exists.
- [ ] Change message creation to persist the job, enqueue it in the background, and return `202` with the job and user message.
- [ ] Keep stop/cancel and job status updates explicit and durable.
- [ ] Add `GET /api/sessions/:id/events` with SSE headers, a session snapshot, bounded replay by `Last-Event-ID` or `after`, and live fan-out.
- [ ] Include SSE event IDs so browser reconnects can request the correct cursor.
- [ ] Run the focused API tests and confirm they pass.

## Chunk 2: Restart recovery and steering

### Task 5: Add restart recovery tests

**Files:** Modify `apps/api/src/app.test.ts`.

- [ ] Persist an active job, close the API, start it again with Hermes returning a running history followed by a terminal history, and verify missing text is appended once.
- [ ] Verify the prompt is not sent again after restart.
- [ ] Verify a terminal recovery publishes a completed event and marks the job completed.
- [ ] Run the focused recovery tests and confirm they fail before the recovery change.

### Task 6: Resume active jobs after API startup

**Files:** Modify `apps/api/src/server.ts`.

- [ ] Replace startup behavior that leaves active jobs paused with background recovery tasks.
- [ ] Reconnect and resume the Hermes session without submitting the saved prompt again.
- [ ] Poll running sessions with bounded delay, publish only the unseen history suffix, and publish terminal events once.
- [ ] Persist state after each meaningful recovery update and keep ambiguous transport failures paused with a visible job error.
- [ ] Ensure a second browser can attach while recovery is running.
- [ ] Run focused recovery tests and confirm they pass.

## Chunk 3: Browser reconnection and TUI-style input

### Task 7: Add browser event client tests

**Files:** Create `apps/web/src/session-events.test.ts`, `apps/web/public/session-events.js`, and `apps/web/public/session-events.d.ts`.

- [ ] Add a failing test for handling a snapshot and agent event.
- [ ] Add a failing test for closing the previous stream when switching sessions.
- [ ] Add a failing test that reports stream errors without sending a stop request.
- [ ] Implement a small EventSource wrapper with `connect`, `close`, and event callbacks.
- [ ] Run the focused browser test and confirm it passes.

### Task 8: Connect the UI to the durable stream

**Files:** Modify `apps/web/public/app.js`.

- [ ] Open one session event stream when a session opens and close it when switching sessions.
- [ ] Apply snapshot events as authoritative session state.
- [ ] Move shared agent-event handling out of the POST reader and into one handler used by every live event source.
- [ ] Track the server event cursor and ignore duplicate replay events.
- [ ] Change `send` to submit JSON and return immediately after the API accepts the job.
- [ ] Remove the `state.running` composer lock. Keep stop visible only while a run is active.
- [ ] Preserve draft text and show Hermes rejection errors without changing another active run.
- [ ] Run focused web tests and type checks.

### Task 9: Ship the browser asset

**Files:** Modify `apps/web/public/sw.js` and `apps/web/src/sw.test.ts`.

- [ ] Add `/session-events.js` to the precache list.
- [ ] Bump the cache version.
- [ ] Update the cache assertion test.
- [ ] Run the service-worker test.

## Chunk 4: Verification

### Task 10: Run the full checks

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run typecheck:e2e`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Run the relevant Chromium E2E tests for reload, session switching, and streaming.
- [ ] Review the diff for unintended changes and commit the implementation.

